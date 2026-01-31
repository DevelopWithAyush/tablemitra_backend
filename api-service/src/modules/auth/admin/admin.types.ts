import { Types } from "mongoose";

export type RoleScope = "GLOBAL" | "CHAIN" | "HOTEL";

export interface ICreateRoleInput {
    key: string;
    scope: RoleScope;
    level: number;
}

export interface ICreatePermissionInput {
    key: string;
    description: string;
}

export interface IAssignPermissionsInput {
    roleId: string;
    permissionIds: string[];
}

export interface IRoleWithPermissions {
    _id: Types.ObjectId;
    key: string;
    scope: RoleScope;
    level: number;
    isActive: boolean;
    permissions: {
        _id: Types.ObjectId;
        key: string;
        description: string;
    }[];
}

export interface IUserContext {
    userId: string;
    roleId: string;
    roleKey: string;
    contextType: RoleScope;
    contextId?: string;
}

export const PERMISSION_CACHE_PREFIX = "permissions";
export const PERMISSION_CACHE_TTL = 60 * 60; // 1 hour in seconds
