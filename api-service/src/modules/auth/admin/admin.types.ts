import { Types } from "mongoose";
import type { AuditEventActor, AuditEventContext } from "../../audit/audit.types.js";

export type RoleScope = "GLOBAL" | "CHAIN" | "HOTEL";

/** Passed from controller so service can publish audit events (actor + request context). */
export interface AdminAuditContext {
    actor: AuditEventActor;
    context?: AuditEventContext;
}

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
