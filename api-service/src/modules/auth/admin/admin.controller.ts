import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/async-handler.js";
import { sendServiceError } from "../../../utils/error-response.js";
import * as adminService from "./admin.service.js";
import type { AdminAuditContext } from "./admin.types.js";
import type { IJwtPayload } from "../auth.types.js";
import type { ActorRole } from "../../audit/audit.types.js";
import {
    CreateRoleSchema,
    UpdateRoleSchema,
    CreatePermissionSchema,
    UpdatePermissionSchema,
    AssignPermissionsSchema,
    SyncPermissionsSchema,
    PaginationSchema,
} from "./validator/admin.validator.js";

function getAuditContext(req: Request): AdminAuditContext {
    const user = (req as Request & { user: IJwtPayload }).user;
    const app = req.params.app;
    const panel = typeof app === "string" ? app : app?.[0];
    return {
        actor: { userId: user.sub, role: "ADMIN" as ActorRole },
        context: { ip: req.ip, userAgent: req.get("User-Agent") ?? undefined, panel },
    };
}

export const getRoles = asyncHandler(async (req: Request, res: Response) => {
    const query = PaginationSchema.parse(req.query);
    const result = await adminService.getRoles(query);

    return res.json({
        success: true,
        ...result,
    });
});

export const getRoleById = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const role = await adminService.getRoleById(id);

    if (!role) {
        return sendServiceError(res, 404, "Role not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: role,
    });
});

export const createRole = asyncHandler(async (req: Request, res: Response) => {
    const input = CreateRoleSchema.parse(req.body);
    const result = await adminService.createRole(input, getAuditContext(req));

    if (!result.success) {
return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.status(201).json({
        success: true,
        data: result.role,
    });
});

export const updateRole = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const input = UpdateRoleSchema.parse(req.body);
    const result = await adminService.updateRole(id, input, getAuditContext(req));

    if (!result.success) {
return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.role,
    });
});

export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const result = await adminService.deleteRole(id, getAuditContext(req));

    if (!result.success) {
return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: "Role deleted successfully",
    });
});

export const getPermissions = asyncHandler(async (req: Request, res: Response) => {
    const query = PaginationSchema.parse(req.query);
    const result = await adminService.getPermissions(query);

    return res.json({
        success: true,
        ...result,
    });
});

export const getPermissionById = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const permission = await adminService.getPermissionById(id);

    if (!permission) {
        return sendServiceError(res, 404, "Permission not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: permission,
    });
});

export const createPermission = asyncHandler(async (req: Request, res: Response) => {
    const input = CreatePermissionSchema.parse(req.body);
    const result = await adminService.createPermission(input, getAuditContext(req));

    if (!result.success) {
return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.status(201).json({
        success: true,
        data: result.permission,
    });
});

export const updatePermission = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const input = UpdatePermissionSchema.parse(req.body);
    const result = await adminService.updatePermission(id, input, getAuditContext(req));

    if (!result.success) {
return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.permission,
    });
});

export const deletePermission = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const result = await adminService.deletePermission(id, getAuditContext(req));

    if (!result.success) {
return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: "Permission deleted successfully",
    });
});

export const assignPermissionsToRole = asyncHandler(async (req: Request, res: Response) => {
    const roleId = typeof req.params.roleId === "string" ? req.params.roleId : req.params.roleId?.[0] ?? "";
    const { permissionIds } = AssignPermissionsSchema.parse(req.body);
    const result = await adminService.assignPermissionsToRole(roleId, permissionIds, getAuditContext(req));

    if (!result.success) {
return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: `${result.assigned} permissions assigned to role`,
    });
});

export const removePermissionFromRole = asyncHandler(async (req: Request, res: Response) => {
    const roleId = typeof req.params.roleId === "string" ? req.params.roleId : req.params.roleId?.[0] ?? "";
    const permissionId = typeof req.params.permissionId === "string" ? req.params.permissionId : req.params.permissionId?.[0] ?? "";
    const result = await adminService.removePermissionFromRole(roleId, permissionId, getAuditContext(req));

    if (!result.success) {
return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: "Permission removed from role",
    });
});

export const syncRolePermissions = asyncHandler(async (req: Request, res: Response) => {
    const roleId = typeof req.params.roleId === "string" ? req.params.roleId : req.params.roleId?.[0] ?? "";
    const { permissionIds } = SyncPermissionsSchema.parse(req.body);
    const result = await adminService.syncRolePermissions(roleId, permissionIds, getAuditContext(req));

    if (!result.success) {
return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: `Permissions synced: ${result.added} added, ${result.removed} removed`,
    });
});
