import { z } from "zod";

// Base schemas (for controller parsing)
export const CreateRoleSchema = z.object({
    key: z
        .string()
        .min(2, "Role key must be at least 2 characters")
        .max(50, "Role key must not exceed 50 characters")
        .regex(/^[A-Z_]+$/, "Role key must be uppercase letters and underscores only"),
    scope: z.enum(["GLOBAL", "CHAIN", "HOTEL"], "Scope must be GLOBAL, CHAIN, or HOTEL"),
    level: z
        .number()
        .int("Level must be an integer")
        .min(1, "Level must be at least 1")
        .max(100, "Level must not exceed 100"),
});

export const UpdateRoleSchema = z.object({
    key: z
        .string()
        .min(2, "Role key must be at least 2 characters")
        .max(50, "Role key must not exceed 50 characters")
        .regex(/^[A-Z_]+$/, "Role key must be uppercase letters and underscores only")
        .optional(),
    scope: z
        .enum(["GLOBAL", "CHAIN", "HOTEL"], "Scope must be GLOBAL, CHAIN, or HOTEL")
        .optional(),
    level: z
        .number()
        .int("Level must be an integer")
        .min(1, "Level must be at least 1")
        .max(100, "Level must not exceed 100")
        .optional(),
});

export const CreatePermissionSchema = z.object({
    key: z
        .string()
        .min(2, "Permission key must be at least 2 characters")
        .max(100, "Permission key must not exceed 100 characters")
        .regex(/^[A-Z_]+$/, "Permission key must be uppercase letters and underscores only"),
    description: z
        .string()
        .min(5, "Description must be at least 5 characters")
        .max(500, "Description must not exceed 500 characters"),
});

export const UpdatePermissionSchema = z.object({
    key: z
        .string()
        .min(2, "Permission key must be at least 2 characters")
        .max(100, "Permission key must not exceed 100 characters")
        .regex(/^[A-Z_]+$/, "Permission key must be uppercase letters and underscores only")
        .optional(),
    description: z
        .string()
        .min(5, "Description must be at least 5 characters")
        .max(500, "Description must not exceed 500 characters")
        .optional(),
});

export const AssignPermissionsSchema = z.object({
    permissionIds: z
        .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid permission ID format"))
        .min(1, "At least one permission ID is required"),
});

export const SyncPermissionsSchema = z.object({
    permissionIds: z
        .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid permission ID format")),
});

export const PaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
});

// Param schemas
const MongoIdParam = z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format"),
});

const RoleIdParam = z.object({
    roleId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid role ID format"),
});

const RolePermissionParams = z.object({
    roleId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid role ID format"),
    permissionId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid permission ID format"),
});

// Route validation schemas (for validate middleware)
export const GetRoleByIdValidation = z.object({
    params: MongoIdParam.passthrough(),
});

export const CreateRoleValidation = z.object({
    body: CreateRoleSchema,
});

export const UpdateRoleValidation = z.object({
    params: MongoIdParam.passthrough(),
    body: UpdateRoleSchema,
});

export const DeleteRoleValidation = z.object({
    params: MongoIdParam.passthrough(),
});

export const GetPermissionByIdValidation = z.object({
    params: MongoIdParam.passthrough(),
});

export const CreatePermissionValidation = z.object({
    body: CreatePermissionSchema,
});

export const UpdatePermissionValidation = z.object({
    params: MongoIdParam.passthrough(),
    body: UpdatePermissionSchema,
});

export const DeletePermissionValidation = z.object({
    params: MongoIdParam.passthrough(),
});

export const AssignPermissionsValidation = z.object({
    params: RoleIdParam.passthrough(),
    body: AssignPermissionsSchema,
});

export const RemovePermissionValidation = z.object({
    params: RolePermissionParams.passthrough(),
});

export const SyncPermissionsValidation = z.object({
    params: RoleIdParam.passthrough(),
    body: SyncPermissionsSchema,
});

// Types
export type CreateRoleDTO = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleDTO = z.infer<typeof UpdateRoleSchema>;
export type CreatePermissionDTO = z.infer<typeof CreatePermissionSchema>;
export type UpdatePermissionDTO = z.infer<typeof UpdatePermissionSchema>;
export type AssignPermissionsDTO = z.infer<typeof AssignPermissionsSchema>;
export type SyncPermissionsDTO = z.infer<typeof SyncPermissionsSchema>;
export type PaginationDTO = z.infer<typeof PaginationSchema>;
