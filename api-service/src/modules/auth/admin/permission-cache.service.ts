import { getRedis } from "../../../infra/redis/redis.js";
import RolePermission from "../db/role-permission.model.js";
import Permission from "../db/permission.model.js";
import {
    PERMISSION_CACHE_PREFIX,
    PERMISSION_CACHE_TTL,
} from "./admin.types.js";
import logger from "../../../helpers/logger/index.js";


const buildCacheKey = (userId: string, roleId: string): string => {
    return `${PERMISSION_CACHE_PREFIX}:${userId}:${roleId}`;
};

export const getUserPermissions = async (
    userId: string,
    roleId: string
): Promise<string[]> => {
    const redis = getRedis();
    const cacheKey = buildCacheKey(userId, roleId);

    const cached = await redis.get(cacheKey);

    if (cached) {
        return JSON.parse(cached);
    }

    const rolePermissions = await RolePermission.find({ roleId })
        .populate<{ permissionId: { key: string } }>("permissionId", "key")
        .lean();

    const permissions: string[] = rolePermissions
        .map((rp) => rp.permissionId?.key)
        .filter(Boolean) as string[];
    
    await redis.setEx(cacheKey, PERMISSION_CACHE_TTL, JSON.stringify(permissions));
    return permissions;
};

export const hasPermission = async (
    userId: string,
    roleId: string,
    requiredPermission: string
): Promise<boolean> => {
    const permissions = await getUserPermissions(userId, roleId);
    return permissions.includes(requiredPermission);
};

export const hasPermissions = async (
    userId: string,
    roleId: string,
    requiredPermissions: string[],
    mode: "any" | "all" = "any"
): Promise<boolean> => {
    const permissions = await getUserPermissions(userId, roleId);

    if (mode === "any") {
        return requiredPermissions.some((p) => permissions.includes(p));
    }
    return requiredPermissions.every((p) => permissions.includes(p));
};

export const invalidateUserPermissionCache = async (
    userId: string,
    roleId: string
): Promise<void> => {
    const redis = getRedis();
    const cacheKey = buildCacheKey(userId, roleId);
    await redis.del(cacheKey);
};

export const invalidateRolePermissionCache = async (
    roleId: string
): Promise<void> => {
    const redis = getRedis();
    const pattern = `${PERMISSION_CACHE_PREFIX}:*:${roleId}`;

    let cursor = "0";
    do {
        const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(result.cursor);

        if (result.keys.length > 0) {
            await redis.del(result.keys);
        }
    } while (cursor !== "0");
};

export const getAllPermissionKeys = async (): Promise<string[]> => {
    const redis = getRedis();
    const cacheKey = `${PERMISSION_CACHE_PREFIX}:all`;

    const cached = await redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }

    const permissions = await Permission.find({ isActive: true })
        .select("key")
        .lean();

    const keys = permissions.map((p) => p.key);

    await redis.setEx(cacheKey, PERMISSION_CACHE_TTL, JSON.stringify(keys));

    return keys;
};

export const invalidateAllPermissionsCache = async (): Promise<void> => {
    const redis = getRedis();
    await redis.del(`${PERMISSION_CACHE_PREFIX}:all`);
};
