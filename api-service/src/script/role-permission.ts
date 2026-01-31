import mongoose from "mongoose";
import dotenv from "dotenv";

import Role from "../modules/auth/db/role.model.js";
import Permission from "../modules/auth/db/permission.model.js";
import RolePermission from "../modules/auth/db/role-permission.model.js";
import logger from "../helpers/logger/index.js";

dotenv.config();

/**
 * Role → Permission Mapping
 * Keys must match Role.key and Permission.key
 */

const rolePermissionMap: Record<string, string[]> = {

    // ===== GLOBAL LEVEL =====

    ADMIN: [
        // Full access — assign every permission
        "ONBOARD_HOTEL", "VIEW_HOTEL", "UPDATE_HOTEL", "DELETE_HOTEL",
        "CREATE_CHAIN", "VIEW_CHAIN", "UPDATE_CHAIN",
        "MANAGE_ROLES", "MANAGE_PERMISSIONS",
        "MANAGE_ADMINS", "MANAGE_CUSTOMER_CARE", "MANAGE_SALES",
        "VIEW_GLOBAL_REPORTS", "EXPORT_GLOBAL_REPORTS",

        "ONBOARD_MANAGER", "VIEW_MANAGER", "UPDATE_MANAGER", "DELETE_MANAGER",
        "VIEW_CHAIN_REPORTS", "EXPORT_CHAIN_REPORTS",
        "VIEW_HOTEL_REPORTS", "EXPORT_HOTEL_REPORTS",

        "CREATE_STAFF", "VIEW_STAFF", "UPDATE_STAFF", "DELETE_STAFF",
        "ASSIGN_STAFF_ROLE", "BLOCK_STAFF", "UNBLOCK_STAFF",

        "CREATE_CUSTOMER_PROFILE", "VIEW_CUSTOMER_PROFILE", "UPDATE_CUSTOMER_PROFILE",

        "CREATE_ORDER", "VIEW_ORDER", "ACCEPT_ORDER", "CANCEL_ORDER",
        "UPDATE_ORDER", "EDIT_ORDER", "REDIRECT_ORDER",

        "CREATE_SERVICE_REQUEST", "VIEW_SERVICE_REQUEST",
        "ACCEPT_SERVICE_REQUEST", "CANCEL_SERVICE_REQUEST",

        "OPEN_KITCHEN_PANEL", "CLOSE_KITCHEN_PANEL",
        "OPEN_ROOM_SERVICE_PANEL", "CLOSE_ROOM_SERVICE_PANEL",

        "VIEW_QR", "CREATE_QR", "UPDATE_QR",

        "LOGIN", "LOGOUT", "RESET_PASSWORD"
    ],

    SALES: [
        "ONBOARD_HOTEL",
        "VIEW_HOTEL",
        "CREATE_CHAIN",
        "VIEW_CHAIN",
        "CREATE_STAFF",
        "VIEW_STAFF",
        "VIEW_QR"
    ],

    CUSTOMER_CARE: [
        "VIEW_HOTEL",
        "UPDATE_HOTEL",
        "VIEW_GLOBAL_REPORTS"
    ],

    // ===== CHAIN LEVEL =====

    FOUNDER: [
        "CREATE_CHAIN",
        "VIEW_CHAIN",
        "UPDATE_CHAIN",
        "ADD_CHAIN_MEMBER",
        "REMOVE_CHAIN_MEMBER",
        "ONBOARD_HOTEL",
        "VIEW_HOTEL",
        "UPDATE_HOTEL",
        "ONBOARD_MANAGER",
        "VIEW_MANAGER",
        "UPDATE_MANAGER",
        "DELETE_MANAGER",
        "CREATE_STAFF",
        "VIEW_STAFF",
        "UPDATE_STAFF",
        "DELETE_STAFF",
        "VIEW_CHAIN_REPORTS",
        "VIEW_HOTEL_REPORTS",
        "EXPORT_HOTEL_REPORTS"
        ,
        "VIEW_QR",
        "CREATE_QR",
        "UPDATE_QR"
    ],

    // ===== HOTEL LEVEL =====

    MANAGER: [
        "CREATE_STAFF",
        "VIEW_STAFF",
        "UPDATE_STAFF",
        "DELETE_STAFF",
        "ASSIGN_STAFF_ROLE",
        "VIEW_HOTEL_REPORTS",
        "VIEW_ORDER",
        "VIEW_QR",
        "CREATE_QR",
        "UPDATE_QR"
    ],

    FRONTDESK: [
        "VIEW_STAFF",
        "VIEW_ORDER",
        "EDIT_ORDER",
        "REDIRECT_ORDER",
        "OPEN_KITCHEN_PANEL",
        "CLOSE_KITCHEN_PANEL",
        "OPEN_ROOM_SERVICE_PANEL",
        "CLOSE_ROOM_SERVICE_PANEL",
        "VIEW_MENU",
        "CREATE_MENU",
        "UPDATE_MENU",
        "DELETE_MENU"
        ,
        "VIEW_QR",
        "CREATE_QR",
        "UPDATE_QR"
    ],

    KITCHEN: [
        "VIEW_ORDER",
        "ACCEPT_ORDER",
        "UPDATE_ORDER",
        "VIEW_MENU",
        "CREATE_MENU",
        "UPDATE_MENU",
        "DELETE_MENU"
    ],

    ROOM_SERVICE: [
        "VIEW_ORDER",
        "ACCEPT_ORDER",
        "UPDATE_ORDER",
        "VIEW_QR"
    ],

    CUSTOMER: [
        "CREATE_CUSTOMER_PROFILE",
        "VIEW_CUSTOMER_PROFILE",
        "CREATE_ORDER",
        "VIEW_ORDER"
    ]
};

async function seedRolePermissions() {
    try {
        await mongoose.connect(process.env.MONGO_URL as string);

        for (const [roleKey, permissionKeys] of Object.entries(rolePermissionMap)) {

            const role = await Role.findOne({ key: roleKey });
            if (!role) {
                logger.warn(`⚠️ Role not found: ${roleKey}`);
                continue;
            }

            const permissions = await Permission.find({
                key: { $in: permissionKeys }
            });

            for (const perm of permissions) {
                await RolePermission.updateOne(
                    { roleId: role._id, permissionId: perm._id },
                    { $setOnInsert: { roleId: role._id, permissionId: perm._id } },
                    { upsert: true }
                );
            }
        }

        logger.info("✅ Role-Permissions seeded successfully");
        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        logger.error("❌ Role-Permission seeding failed", error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

export default seedRolePermissions;
