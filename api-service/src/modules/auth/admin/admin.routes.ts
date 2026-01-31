import { Router } from "express";
import * as adminController from "./admin.controller.js";
import { authMiddleware } from "../../../middleware/auth.middleware.js";
import { requirePermissions } from "../../../middleware/permission.middleware.js";
import { validate } from "../../../middleware/validate.middleware.js";
import {
    GetRoleByIdValidation,
    CreateRoleValidation,
    UpdateRoleValidation,
    DeleteRoleValidation,
    GetPermissionByIdValidation,
    CreatePermissionValidation,
    UpdatePermissionValidation,
    DeletePermissionValidation,
    AssignPermissionsValidation,
    RemovePermissionValidation,
    SyncPermissionsValidation,
} from "./validator/admin.validator.js";

// mergeParams: true to inherit :app from parent route
const adminRoutes = Router({ mergeParams: true });

adminRoutes.use(authMiddleware);

// Roles
adminRoutes.get(
    "/roles",
    requirePermissions("MANAGE_ROLES"),
    adminController.getRoles
);

adminRoutes.get(
    "/roles/:id",
    requirePermissions("MANAGE_ROLES"),
    validate(GetRoleByIdValidation),
    adminController.getRoleById
);

adminRoutes.post(
    "/roles",
    requirePermissions("MANAGE_ROLES"),
    validate(CreateRoleValidation),
    adminController.createRole
);

adminRoutes.patch(
    "/roles/:id",
    requirePermissions("MANAGE_ROLES"),
    validate(UpdateRoleValidation),
    adminController.updateRole
);

adminRoutes.delete(
    "/roles/:id",
    requirePermissions("MANAGE_ROLES"),
    validate(DeleteRoleValidation),
    adminController.deleteRole
);

// Permissions
adminRoutes.get(
    "/permissions",
    requirePermissions("MANAGE_PERMISSIONS"),
    adminController.getPermissions
);

adminRoutes.get(
    "/permissions/:id",
    requirePermissions("MANAGE_PERMISSIONS"),
    validate(GetPermissionByIdValidation),
    adminController.getPermissionById
);

adminRoutes.post(
    "/permissions",
    requirePermissions("MANAGE_PERMISSIONS"),
    validate(CreatePermissionValidation),
    adminController.createPermission
);

adminRoutes.patch(
    "/permissions/:id",
    requirePermissions("MANAGE_PERMISSIONS"),
    validate(UpdatePermissionValidation),
    adminController.updatePermission
);

adminRoutes.delete(
    "/permissions/:id",
    requirePermissions("MANAGE_PERMISSIONS"),
    validate(DeletePermissionValidation),
    adminController.deletePermission
);

// Role-Permission Assignment
adminRoutes.post(
    "/roles/:roleId/permissions",
    requirePermissions(["MANAGE_ROLES", "MANAGE_PERMISSIONS"], "all"),
    validate(AssignPermissionsValidation),
    adminController.assignPermissionsToRole
);

adminRoutes.delete(
    "/roles/:roleId/permissions/:permissionId",
    requirePermissions(["MANAGE_ROLES", "MANAGE_PERMISSIONS"], "all"),
    validate(RemovePermissionValidation),
    adminController.removePermissionFromRole
);

adminRoutes.put(
    "/roles/:roleId/permissions",
    requirePermissions(["MANAGE_ROLES", "MANAGE_PERMISSIONS"], "all"),
    validate(SyncPermissionsValidation),
    adminController.syncRolePermissions
);

export default adminRoutes;
