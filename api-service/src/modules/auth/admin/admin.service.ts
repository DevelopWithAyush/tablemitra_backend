import { Types } from "mongoose";
import { runInTransaction } from "../../../infra/db/transaction.js";
import { getRedis } from "../../../infra/redis/redis.js";
import Role from "../db/role.model.js";
import Permission from "../db/permission.model.js";
import RolePermission from "../db/role-permission.model.js";
import {
    ICreateRoleInput,
    ICreatePermissionInput,
    IRoleWithPermissions,
    PERMISSION_CACHE_TTL,
    AdminAuditContext,
} from "./admin.types.js";
import {
    invalidateRolePermissionCache,
    invalidateAllPermissionsCache,
} from "./permission-cache.service.js";
import { publishAuditEvent } from "../../audit/audit.publisher.js";
import logger from "../../../helpers/logger/index.js";

// Cache keys
const CACHE_KEYS = {
    ROLES_LIST: "admin:roles:list",
    ROLE_BY_ID: (id: string) => `admin:roles:${id}`,
    PERMISSIONS_LIST: "admin:permissions:list",
    PERMISSION_BY_ID: (id: string) => `admin:permissions:${id}`,
};

interface PaginationOptions {
    page?: number;
    limit?: number;
    search?: string;
}

interface PaginatedResult<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

// Helper to build cache key with pagination/search params
const buildListCacheKey = (base: string, options: PaginationOptions): string => {
    const { page = 1, limit = 20, search = "" } = options;
    return `${base}:${page}:${limit}:${search}`;
};

// Invalidate all roles list cache
const invalidateRolesListCache = async (): Promise<void> => {
    const redis = getRedis();
    const pattern = `${CACHE_KEYS.ROLES_LIST}:*`;

    let cursor = "0";
    do {
        const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(result.cursor);
        if (result.keys.length > 0) {
            await redis.del(result.keys);
        }
    } while (cursor !== "0");
};

// Invalidate all permissions list cache
const invalidatePermissionsListCache = async (): Promise<void> => {
    const redis = getRedis();
    const pattern = `${CACHE_KEYS.PERMISSIONS_LIST}:*`;

    let cursor = "0";
    do {
        const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(result.cursor);
        if (result.keys.length > 0) {
            await redis.del(result.keys);
        }
    } while (cursor !== "0");
};

// ==================== ROLES ====================

export const getRoles = async (
    options: PaginationOptions = {}
): Promise<PaginatedResult<IRoleWithPermissions>> => {
    const redis = getRedis();
    const cacheKey = buildListCacheKey(CACHE_KEYS.ROLES_LIST, options);

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }

    const { page = 1, limit = 20, search } = options;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { isActive: true };
    if (search) {
        filter.key = { $regex: search, $options: "i" };
    }

    const [roles, total] = await Promise.all([
        Role.find(filter).sort({ level: -1 }).skip(skip).limit(limit).lean(),
        Role.countDocuments(filter),
    ]);

    const rolesWithPermissions: IRoleWithPermissions[] = await Promise.all(
        roles.map(async (role) => {
            const rolePermissions = await RolePermission.find({ roleId: role._id })
                .populate<{ permissionId: { _id: Types.ObjectId; key: string; description: string } }>(
                    "permissionId",
                    "key description"
                )
                .lean();

            const permissions = rolePermissions
                .filter((rp) => rp.permissionId)
                .map((rp) => ({
                    _id: rp.permissionId._id,
                    key: rp.permissionId.key,
                    description: rp.permissionId.description,
                }));

            return {
                _id: role._id as Types.ObjectId,
                key: role.key,
                scope: role.scope as IRoleWithPermissions["scope"],
                level: role.level,
                isActive: role.isActive,
                permissions,
            };
        })
    );

    const result = {
        data: rolesWithPermissions,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };

    // Cache for 1 hour
    await redis.setEx(cacheKey, PERMISSION_CACHE_TTL, JSON.stringify(result));

    return result;
};

export const getRoleById = async (
    roleId: string
): Promise<IRoleWithPermissions | null> => {
    const redis = getRedis();
    const cacheKey = CACHE_KEYS.ROLE_BY_ID(roleId);

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }

    const role = await Role.findById(roleId).lean();
    if (!role) return null;

    const rolePermissions = await RolePermission.find({ roleId: role._id })
        .populate<{ permissionId: { _id: Types.ObjectId; key: string; description: string } }>(
            "permissionId",
            "key description"
        )
        .lean();

    const permissions = rolePermissions
        .filter((rp) => rp.permissionId)
        .map((rp) => ({
            _id: rp.permissionId._id,
            key: rp.permissionId.key,
            description: rp.permissionId.description,
        }));

    const result: IRoleWithPermissions = {
        _id: role._id as Types.ObjectId,
        key: role.key,
        scope: role.scope as IRoleWithPermissions["scope"],
        level: role.level,
        isActive: role.isActive,
        permissions,
    };

    // Cache for 1 hour
    await redis.setEx(cacheKey, PERMISSION_CACHE_TTL, JSON.stringify(result));

    return result;
};

export const createRole = async (
    input: ICreateRoleInput,
    auditContext?: AdminAuditContext
): Promise<{ success: boolean; role?: IRoleWithPermissions; message?: string }> => {
    const existing = await Role.findOne({ key: input.key });
    if (existing) {
        return { success: false, message: "Role with this key already exists" };
    }

    const role = await Role.create({
        key: input.key.toUpperCase(),
        scope: input.scope,
        level: input.level,
        isActive: true,
    });

    // Invalidate list cache
    await invalidateRolesListCache();

    if (auditContext) {
        publishAuditEvent(
            "ROLE_CREATED",
            "ROLE",
            role._id.toString(),
            auditContext.actor,
            { context: auditContext.context, newData: { key: role.key, scope: role.scope, level: role.level } }
        ).catch((err) => logger.error("Audit publish failed:", err));
    }

    return {
        success: true,
        role: {
            _id: role._id as Types.ObjectId,
            key: role.key,
            scope: role.scope as IRoleWithPermissions["scope"],
            level: role.level,
            isActive: role.isActive,
            permissions: [],
        },
    };
};

export const updateRole = async (
    roleId: string,
    input: Partial<ICreateRoleInput>,
    auditContext?: AdminAuditContext
): Promise<{ success: boolean; role?: IRoleWithPermissions; message?: string }> => {
    const role = await Role.findById(roleId);
    if (!role) {
        return { success: false, message: "Role not found" };
    }

    const previousData = { key: role.key, scope: role.scope, level: role.level };

    if (input.key && input.key !== role.key) {
        const existing = await Role.findOne({ key: input.key, _id: { $ne: roleId } });
        if (existing) {
            return { success: false, message: "Role with this key already exists" };
        }
        role.key = input.key.toUpperCase();
    }

    if (input.scope) role.scope = input.scope;
    if (input.level !== undefined) role.level = input.level;

    await role.save();

    // Invalidate caches
    const redis = getRedis();
    await Promise.all([
        redis.del(CACHE_KEYS.ROLE_BY_ID(roleId)),
        invalidateRolesListCache(),
        invalidateRolePermissionCache(roleId),
    ]);

    if (auditContext) {
        publishAuditEvent(
            "ROLE_UPDATED",
            "ROLE",
            roleId,
            auditContext.actor,
            {
                context: auditContext.context,
                previousData,
                newData: { key: role.key, scope: role.scope, level: role.level },
            }
        ).catch((err) => logger.error("Audit publish failed:", err));
    }

    return { success: true, role: await getRoleById(roleId) as IRoleWithPermissions };
};

export const deleteRole = async (
    roleId: string,
    auditContext?: AdminAuditContext
): Promise<{ success: boolean; message?: string }> => {
    const role = await Role.findById(roleId);
    if (!role) {
        return { success: false, message: "Role not found" };
    }

    const previousData = { key: role.key, scope: role.scope, level: role.level, isActive: role.isActive };

    role.isActive = false;
    await role.save();

    // Invalidate caches
    const redis = getRedis();
    await Promise.all([
        redis.del(CACHE_KEYS.ROLE_BY_ID(roleId)),
        invalidateRolesListCache(),
        invalidateRolePermissionCache(roleId),
    ]);

    if (auditContext) {
        publishAuditEvent(
            "ROLE_DELETED",
            "ROLE",
            roleId,
            auditContext.actor,
            { context: auditContext.context, previousData }
        ).catch((err) => logger.error("Audit publish failed:", err));
    }

    return { success: true };
};

// ==================== PERMISSIONS ====================

export const getPermissions = async (
    options: PaginationOptions = {}
): Promise<PaginatedResult<{ _id: Types.ObjectId; key: string; description: string; isActive: boolean }>> => {
    const redis = getRedis();
    const cacheKey = buildListCacheKey(CACHE_KEYS.PERMISSIONS_LIST, options);

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }

    const { page = 1, limit = 50, search } = options;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { isActive: true };
    if (search) {
        filter.$or = [
            { key: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
        ];
    }

    const [permissions, total] = await Promise.all([
        Permission.find(filter).sort({ key: 1 }).skip(skip).limit(limit).lean(),
        Permission.countDocuments(filter),
    ]);

    const result = {
        data: permissions.map((p) => ({
            _id: p._id as Types.ObjectId,
            key: p.key,
            description: p.description,
            isActive: p.isActive,
        })),
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };

    // Cache for 1 hour
    await redis.setEx(cacheKey, PERMISSION_CACHE_TTL, JSON.stringify(result));

    return result;
};

export const getPermissionById = async (
    permissionId: string
): Promise<{ _id: Types.ObjectId; key: string; description: string; isActive: boolean } | null> => {
    const redis = getRedis();
    const cacheKey = CACHE_KEYS.PERMISSION_BY_ID(permissionId);

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }

    const permission = await Permission.findById(permissionId).lean();
    if (!permission) return null;

    const result = {
        _id: permission._id as Types.ObjectId,
        key: permission.key,
        description: permission.description,
        isActive: permission.isActive,
    };

    // Cache for 1 hour
    await redis.setEx(cacheKey, PERMISSION_CACHE_TTL, JSON.stringify(result));

    return result;
};

export const createPermission = async (
    input: ICreatePermissionInput,
    auditContext?: AdminAuditContext
): Promise<{ success: boolean; permission?: { _id: Types.ObjectId; key: string; description: string }; message?: string }> => {
    const existing = await Permission.findOne({ key: input.key });
    if (existing) {
        return { success: false, message: "Permission with this key already exists" };
    }

    const permission = await Permission.create({
        key: input.key.toUpperCase(),
        description: input.description,
        isActive: true,
    });

    // Invalidate caches
    await Promise.all([
        invalidatePermissionsListCache(),
        invalidateAllPermissionsCache(),
    ]);

    if (auditContext) {
        publishAuditEvent(
            "PERMISSION_CREATED",
            "PERMISSION",
            permission._id.toString(),
            auditContext.actor,
            { context: auditContext.context, newData: { key: permission.key, description: permission.description } }
        ).catch((err) => logger.error("Audit publish failed:", err));
    }

    return {
        success: true,
        permission: {
            _id: permission._id as Types.ObjectId,
            key: permission.key,
            description: permission.description,
        },
    };
};

export const updatePermission = async (
    permissionId: string,
    input: Partial<ICreatePermissionInput>,
    auditContext?: AdminAuditContext
): Promise<{ success: boolean; permission?: { _id: Types.ObjectId; key: string; description: string }; message?: string }> => {
    const permission = await Permission.findById(permissionId);
    if (!permission) {
        return { success: false, message: "Permission not found" };
    }

    const previousData = { key: permission.key, description: permission.description };

    if (input.key && input.key !== permission.key) {
        const existing = await Permission.findOne({ key: input.key, _id: { $ne: permissionId } });
        if (existing) {
            return { success: false, message: "Permission with this key already exists" };
        }
        permission.key = input.key.toUpperCase();
    }

    if (input.description) permission.description = input.description;

    await permission.save();

    // Invalidate caches
    const redis = getRedis();
    await Promise.all([
        redis.del(CACHE_KEYS.PERMISSION_BY_ID(permissionId)),
        invalidatePermissionsListCache(),
        invalidateAllPermissionsCache(),
    ]);

    if (auditContext) {
        publishAuditEvent(
            "PERMISSION_UPDATED",
            "PERMISSION",
            permissionId,
            auditContext.actor,
            {
                context: auditContext.context,
                previousData,
                newData: { key: permission.key, description: permission.description },
            }
        ).catch((err) => logger.error("Audit publish failed:", err));
    }

    return {
        success: true,
        permission: {
            _id: permission._id as Types.ObjectId,
            key: permission.key,
            description: permission.description,
        },
    };
};

export const deletePermission = async (
    permissionId: string,
    auditContext?: AdminAuditContext
): Promise<{ success: boolean; message?: string }> => {
    const permission = await Permission.findById(permissionId);
    if (!permission) {
        return { success: false, message: "Permission not found" };
    }

    const previousData = { key: permission.key, description: permission.description, isActive: permission.isActive };

    permission.isActive = false;
    await permission.save();

    // Invalidate caches
    const redis = getRedis();
    await Promise.all([
        redis.del(CACHE_KEYS.PERMISSION_BY_ID(permissionId)),
        invalidatePermissionsListCache(),
        invalidateAllPermissionsCache(),
    ]);

    if (auditContext) {
        publishAuditEvent(
            "PERMISSION_DELETED",
            "PERMISSION",
            permissionId,
            auditContext.actor,
            { context: auditContext.context, previousData }
        ).catch((err) => logger.error("Audit publish failed:", err));
    }

    return { success: true };
};

// ==================== ROLE-PERMISSION ASSIGNMENT ====================

export const assignPermissionsToRole = async (
    roleId: string,
    permissionIds: string[],
    auditContext?: AdminAuditContext
): Promise<{ success: boolean; message?: string; assigned?: number }> => {
    const role = await Role.findById(roleId);
    if (!role) {
        return { success: false, message: "Role not found" };
    }

    const validPermissions = await Permission.find({
        _id: { $in: permissionIds },
        isActive: true,
    });

    if (validPermissions.length === 0) {
        return { success: false, message: "No valid permissions found" };
    }

    const operations = validPermissions.map((permission) => ({
        updateOne: {
            filter: { roleId: role._id, permissionId: permission._id },
            update: { $setOnInsert: { roleId: role._id, permissionId: permission._id } },
            upsert: true,
        },
    }));

    await RolePermission.bulkWrite(operations);

    // Invalidate caches
    const redis = getRedis();
    await Promise.all([
        redis.del(CACHE_KEYS.ROLE_BY_ID(roleId)),
        invalidateRolesListCache(),
        invalidateRolePermissionCache(roleId),
    ]);

    if (auditContext) {
        publishAuditEvent(
            "ROLE_PERMISSIONS_ASSIGNED",
            "ROLE",
            roleId,
            auditContext.actor,
            {
                context: auditContext.context,
                newData: { permissionIds, assignedCount: validPermissions.length },
            }
        ).catch((err) => logger.error("Audit publish failed:", err));
    }

    return { success: true, assigned: validPermissions.length };
};

export const removePermissionFromRole = async (
    roleId: string,
    permissionId: string,
    auditContext?: AdminAuditContext
): Promise<{ success: boolean; message?: string }> => {
    const result = await RolePermission.deleteOne({
        roleId: new Types.ObjectId(roleId),
        permissionId: new Types.ObjectId(permissionId),
    });

    if (result.deletedCount === 0) {
        return { success: false, message: "Permission not assigned to this role" };
    }

    // Invalidate caches
    const redis = getRedis();
    await Promise.all([
        redis.del(CACHE_KEYS.ROLE_BY_ID(roleId)),
        invalidateRolesListCache(),
        invalidateRolePermissionCache(roleId),
    ]);

    if (auditContext) {
        publishAuditEvent(
            "ROLE_PERMISSIONS_SYNCED",
            "ROLE",
            roleId,
            auditContext.actor,
            { context: auditContext.context, metadata: { removedPermissionId: permissionId } }
        ).catch((err) => logger.error("Audit publish failed:", err));
    }

    return { success: true };
};

export const syncRolePermissions = async (
    roleId: string,
    permissionIds: string[],
    auditContext?: AdminAuditContext
): Promise<{ success: boolean; message?: string; added?: number; removed?: number }> => {
    const role = await Role.findById(roleId);
    if (!role) {
        return { success: false, message: "Role not found" };
    }

    const currentPermissions = await RolePermission.find({ roleId: role._id }).lean();
    const currentPermissionIds = currentPermissions.map((rp) => rp.permissionId.toString());

    const toAdd = permissionIds.filter((id) => !currentPermissionIds.includes(id));
    const toRemove = currentPermissionIds.filter((id) => !permissionIds.includes(id));

    // Wrap both writes atomically: if the insert succeeds but the delete fails
    // (or vice versa), the role ends up with a partially-synced permission set.
    if (toAdd.length > 0 || toRemove.length > 0) {
        const validPermissions = toAdd.length > 0
            ? await Permission.find({ _id: { $in: toAdd }, isActive: true })
            : [];

        await runInTransaction(async (session) => {
            if (validPermissions.length > 0) {
                const addOperations = validPermissions.map((permission) => ({
                    insertOne: { document: { roleId: role._id, permissionId: permission._id } },
                }));
                await RolePermission.bulkWrite(addOperations, { session });
            }

            if (toRemove.length > 0) {
                await RolePermission.deleteMany(
                    { roleId: role._id, permissionId: { $in: toRemove.map((id) => new Types.ObjectId(id)) } },
                    { session }
                );
            }
        });
    }

    // Invalidate caches
    const redis = getRedis();
    await Promise.all([
        redis.del(CACHE_KEYS.ROLE_BY_ID(roleId)),
        invalidateRolesListCache(),
        invalidateRolePermissionCache(roleId),
    ]);

    if (auditContext) {
        publishAuditEvent(
            "ROLE_PERMISSIONS_SYNCED",
            "ROLE",
            roleId,
            auditContext.actor,
            {
                context: auditContext.context,
                newData: { permissionIds, added: toAdd.length, removed: toRemove.length },
            }
        ).catch((err) => logger.error("Audit publish failed:", err));
    }

    return { success: true, added: toAdd.length, removed: toRemove.length };
};
