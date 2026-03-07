import mongoose from "mongoose";
import dotenv from "dotenv";

import Role from "../modules/auth/db/role.model.js";
import Permission from "../modules/auth/db/permission.model.js";
import RolePermission from "../modules/auth/db/role-permission.model.js";
import logger from "../helpers/logger/index.js";
import { permissions } from "./permission1.js";

dotenv.config();

/**
 * Role → Permission Mapping
 * Keys must match Role.key and Permission.key
 */

const rolePermissionMap: Record<string, string[]> = {

    // ===== GLOBAL LEVEL =====

    ADMIN: [
        // Full access — assign every permission
        ...permissions.map(permission => permission.key)
    ],

    SALES: [
        "CREATE_CHAIN",
        "VIEW_CHAIN",
        "ONBOARD_CHAIN",
        "ONBOARD_HOTEL",
        "CREATE_ATTACHMENT",
        "VIEW_ATTACHMENT",
        "UPDATE_ATTACHMENT",
        "DELETE_ATTACHMENT",
    ],

    CUSTOMER_CARE: [
        "VIEW_CHAIN",
        "ONBOARD_CHAIN",
        "VIEW_HOTEL",
        "UPDATE_HOTEL",
        "VIEW_GLOBAL_REPORTS",
        "EXPORT_GLOBAL_REPORTS",
        "VIEW_CHAIN_REPORTS",
        "EXPORT_CHAIN_REPORTS",
        "VIEW_HOTEL_REPORTS",
        "EXPORT_HOTEL_REPORTS",
        "CREATE_ATTACHMENT",
        "VIEW_ATTACHMENT",
        "UPDATE_ATTACHMENT",
        "DELETE_ATTACHMENT",
    ],

    // ===== CHAIN LEVEL =====

    FOUNDER: [
        "CREATE_CHAIN",
        "VIEW_CHAIN",
        "UPDATE_CHAIN",
        "SWITCH_CHAIN",
        "ADD_CHAIN_MEMBER",
        "VIEW_CHAIN_MEMBERS",
        "ONBOARD_HOTEL",
        "VIEW_HOTEL",
        "UPDATE_HOTEL",
        "CREATE_STAFF",
        "VIEW_STAFF",
        "UPDATE_STAFF",
        "DELETE_STAFF",
        "VIEW_CHAIN_REPORTS",
        "EXPORT_CHAIN_REPORTS",
        "VIEW_HOTEL_REPORTS",
        "EXPORT_HOTEL_REPORTS",
        "CREATE_ATTACHMENT",
        "VIEW_ATTACHMENT",
        "UPDATE_ATTACHMENT",
        "DELETE_ATTACHMENT",
    ],

    // ===== HOTEL LEVEL =====

    MANAGER: [
        "CREATE_STAFF",
        "VIEW_STAFF",
        "UPDATE_STAFF",
        "DELETE_STAFF",
        "VIEW_HOTEL_REPORTS",
        "EXPORT_HOTEL_REPORTS",
        "VIEW_FOOD_ORDER",
        "VIEW_SERVICE_REQUEST",
        "VIEW_QR",
        "CREATE_QR",
        "UPDATE_QR",
        "DELETE_QR",
        "CREATE_ATTACHMENT",
        "VIEW_ATTACHMENT",
        "UPDATE_ATTACHMENT",
        "DELETE_ATTACHMENT",
    ],

    FRONTDESK: [
        "VIEW_QR",
        "CHECK_IN_GUEST",
        "CREATE_FOOD_ORDER",
        "UPDATE_FOOD_ORDER_STATUS",
        "EDIT_FOOD_ORDER",
        "VIEW_FOOD_ORDER",
        "CREATE_SERVICE_REQUEST",
        "UPDATE_SERVICE_REQUEST_STATUS",
        "EDIT_SERVICE_REQUEST",
        "VIEW_SERVICE_REQUEST",
        "VIEW_MENU",
        "CREATE_MENU",
        "UPDATE_MENU",
        "DELETE_MENU",
        "VIEW_SERVICE",
        "CREATE_SERVICE",
        "UPDATE_SERVICE",
        "DELETE_SERVICE",
        "CREATE_ATTACHMENT",
        "VIEW_ATTACHMENT",
        "UPDATE_ATTACHMENT",
        "DELETE_ATTACHMENT",
    ],

    KITCHEN: [
        "CREATE_FOOD_ORDER",
        "UPDATE_FOOD_ORDER_STATUS",
        "EDIT_FOOD_ORDER",
        "VIEW_FOOD_ORDER",
        "VIEW_MENU",
        "CREATE_MENU",
        "UPDATE_MENU",
        "DELETE_MENU",
        "CREATE_ATTACHMENT",
        "VIEW_ATTACHMENT",
        "UPDATE_ATTACHMENT",
        "DELETE_ATTACHMENT",
    ],

    ROOM_SERVICE: [
        "CREATE_FOOD_ORDER",
        "UPDATE_FOOD_ORDER_STATUS",
        "EDIT_FOOD_ORDER",
        "VIEW_FOOD_ORDER",
        "CREATE_SERVICE_REQUEST",
        "UPDATE_SERVICE_REQUEST_STATUS",
        "EDIT_SERVICE_REQUEST",
        "VIEW_SERVICE_REQUEST",
        "VIEW_MENU",
        "CREATE_MENU",
        "UPDATE_MENU",
        "DELETE_MENU",
        "VIEW_SERVICE",
        "CREATE_SERVICE",
        "UPDATE_SERVICE",
        "DELETE_SERVICE",
        "CREATE_ATTACHMENT",
        "VIEW_ATTACHMENT",
        "UPDATE_ATTACHMENT",
        "DELETE_ATTACHMENT",
    ],

    CUSTOMER: [
        "CREATE_CUSTOMER_PROFILE",
        "VIEW_CUSTOMER_PROFILE",
        "CREATE_FOOD_ORDER",
        "CREATE_SERVICE_REQUEST",
        "CREATE_ATTACHMENT",
        "VIEW_ATTACHMENT",
        "UPDATE_ATTACHMENT",
        "DELETE_ATTACHMENT",
    ]
};

async function seedRolePermissions() {
    try {
        // await mongoose.connect(process.env.MONGO_URL as string);

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
