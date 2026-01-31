import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/async-handler.js";
import * as adminService from "./admin.service.js";
import {
    CreateRoleSchema,
    UpdateRoleSchema,
    CreatePermissionSchema,
    UpdatePermissionSchema,
    AssignPermissionsSchema,
    SyncPermissionsSchema,
    PaginationSchema,
} from "./validator/admin.validator.js";

export const getRoles = asyncHandler(async (req: Request, res: Response) => {
    const query = PaginationSchema.parse(req.query);
    const result = await adminService.getRoles(query);

    return res.json({
        success: true,
        ...result,
    });
});

export const getRoleById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const role = await adminService.getRoleById(id);

    if (!role) {
        return res.status(404).json({
            success: false,
            message: "Role not found",
        });
    }

    return res.json({
        success: true,
        data: role,
    });
});

export const createRole = asyncHandler(async (req: Request, res: Response) => {
    const input = CreateRoleSchema.parse(req.body);
    const result = await adminService.createRole(input);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.status(201).json({
        success: true,
        data: result.role,
    });
});

export const updateRole = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const input = UpdateRoleSchema.parse(req.body);
    const result = await adminService.updateRole(id, input);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        data: result.role,
    });
});

export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await adminService.deleteRole(id);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
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
    const { id } = req.params;
    const permission = await adminService.getPermissionById(id);

    if (!permission) {
        return res.status(404).json({
            success: false,
            message: "Permission not found",
        });
    }

    return res.json({
        success: true,
        data: permission,
    });
});

export const createPermission = asyncHandler(async (req: Request, res: Response) => {
    const input = CreatePermissionSchema.parse(req.body);
    const result = await adminService.createPermission(input);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.status(201).json({
        success: true,
        data: result.permission,
    });
});

export const updatePermission = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const input = UpdatePermissionSchema.parse(req.body);
    const result = await adminService.updatePermission(id, input);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        data: result.permission,
    });
});

export const deletePermission = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await adminService.deletePermission(id);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: "Permission deleted successfully",
    });
});

export const assignPermissionsToRole = asyncHandler(async (req: Request, res: Response) => {
    const { roleId } = req.params;
    const { permissionIds } = AssignPermissionsSchema.parse(req.body);
    const result = await adminService.assignPermissionsToRole(roleId, permissionIds);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: `${result.assigned} permissions assigned to role`,
    });
});

export const removePermissionFromRole = asyncHandler(async (req: Request, res: Response) => {
    const { roleId, permissionId } = req.params;
    const result = await adminService.removePermissionFromRole(roleId, permissionId);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: "Permission removed from role",
    });
});

export const syncRolePermissions = asyncHandler(async (req: Request, res: Response) => {
    const { roleId } = req.params;
    const { permissionIds } = SyncPermissionsSchema.parse(req.body);
    const result = await adminService.syncRolePermissions(roleId, permissionIds);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: `Permissions synced: ${result.added} added, ${result.removed} removed`,
    });
});
