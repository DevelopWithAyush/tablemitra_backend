import { NextFunction, Request, Response } from "express";
import { IJwtPayload } from "../modules/auth/auth.types.js";
import { hasPermissions } from "../modules/auth/admin/permission-cache.service.js";
import UserRole from "../modules/auth/db/user-role.model.js";
import { ErrorHandler } from "./error.middleware.js";
import logger from "../helpers/logger/index.js";

export interface AuthenticatedRequest extends Request {
    user: IJwtPayload;
}

type PermissionMode = "any" | "all";

interface PermissionGuardOptions {
    permissions: string[];
    mode?: PermissionMode;
    checkContext?: boolean;
}

const extractContextFromRequest = (req: Request): { hotelId?: string; chainId?: string } => {
    return {
        hotelId: (req.params.hotelId || req.body?.hotelId || req.query.hotelId) as string | undefined,
        chainId: (req.params.chainId || req.body?.chainId || req.query.chainId) as string | undefined,
    };
};

const verifyContextAccess = async (
    userId: string,
    roleId: string,
    contextType: string,
    requestContext: { hotelId?: string; chainId?: string }
): Promise<boolean> => {
    if (contextType === "GLOBAL") {
        return true;
    }

    const userRole = await UserRole.findOne({
        userId,
        roleId,
        isActive: true,
        isDeleted: false,
        isBlocked: false,
    }).lean();

    if (!userRole) {
        return false;
    }

    if (contextType === "CHAIN" && requestContext.chainId) {
        return userRole.contextId?.toString() === requestContext.chainId;
    }

    if (contextType === "HOTEL" && requestContext.hotelId) {
        return userRole.contextId?.toString() === requestContext.hotelId;
    }

    return true;
};

export const requirePermissions = (
    permissions: string | string[],
    mode: PermissionMode = "any",
    checkContext: boolean = true
) => {
    const permissionList = Array.isArray(permissions) ? permissions : [permissions];

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const user = (req as AuthenticatedRequest).user;
            logger.info(JSON.stringify(user, null, 2))

            if (!user || !user.sub || !user.roleId) {
                throw new ErrorHandler("Unauthorized: Invalid token", 401);
            }

            // First verify UserRole is still active (not blocked/deleted)
            const userRole = await UserRole.findOne({
                userId: user.sub,
                roleId: user.roleId,
                isActive: true,
                isDeleted: false,
                isBlocked: false,
            }).lean();

            if (!userRole) {
                // Check specific reason with actual message from DB
                const inactiveRole = await UserRole.findOne({
                    userId: user.sub,
                    roleId: user.roleId,
                }).lean();

                if (inactiveRole?.isBlocked) {
                    const reason = inactiveRole.blockedReason
                        ? `Reason: ${inactiveRole.blockedReason}`
                        : "Please contact support.";
                    throw new ErrorHandler(`Your account has been blocked. ${reason}`, 403);
                }
                if (inactiveRole?.isDeleted) {
                    const reason = inactiveRole.deletedReason
                        ? `Reason: ${inactiveRole.deletedReason}`
                        : "";
                    throw new ErrorHandler(`Your account has been removed. ${reason}`.trim(), 403);
                }
                if (inactiveRole && !inactiveRole.isActive) {
                    throw new ErrorHandler("Your account is temporarily inactive. Please contact support.", 403);
                }
                throw new ErrorHandler("Unauthorized: Role not found", 401);
            }

            const hasRequiredPermissions = await hasPermissions(
                user.sub,
                user.roleId,
                permissionList,
                mode
            );

            if (!hasRequiredPermissions) {
                throw new ErrorHandler("Forbidden: Insufficient permissions", 403);
            }

            if (checkContext && user.ctx?.type) {
                const requestContext = extractContextFromRequest(req);

                const hasContextAccess = await verifyContextAccess(
                    user.sub,
                    user.roleId,
                    user.ctx.type,
                    requestContext
                );

                if (!hasContextAccess) {
                    throw new ErrorHandler("Forbidden: No access to this resource", 403);
                }
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

export const requireAllPermissions = (
    permissions: string[],
    checkContext: boolean = true
) => {
    return requirePermissions(permissions, "all", checkContext);
};

export const requireAnyPermission = (
    permissions: string[],
    checkContext: boolean = true
) => {
    return requirePermissions(permissions, "any", checkContext);
};
