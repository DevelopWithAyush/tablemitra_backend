import dotenv from "dotenv";
import mongoose from "mongoose";
import logger from "../helpers/logger/index.js";
import Permission from "../modules/auth/db/permission.model.js";

dotenv.config();
export const permissions = [

    // ===== SaaS / GLOBAL LEVEL =====
    {
        key: "ONBOARD_HOTEL",
        description: "Onboard a new hotel into the platform"
    },
    {
        key: "VIEW_HOTEL",
        description: "View hotel details"
    },
    {
        key: "UPDATE_HOTEL",
        description: "Update hotel details"
    },
    {
        key: "DELETE_HOTEL",
        description: "Delete a hotel"
    },

    { key: "MANAGE_ROLES", description: "Create and manage roles" },
    { key: "MANAGE_PERMISSIONS", description: "Create and manage permissions" },
    { key: "MANAGE_ADMINS", description: "Manage admin profiles" },
    { key: "MANAGE_CUSTOMER_CARE", description: "Manage customer care profiles" },
    { key: "MANAGE_SALES", description: "Manage sales profiles" },

    { key: "VIEW_GLOBAL_REPORTS", description: "View SaaS-level reports" },
    { key: "EXPORT_GLOBAL_REPORTS", description: "Export SaaS-level reports" },

    // ===== CHAIN / FOUNDER LEVEL =====
    { key: "CREATE_CHAIN", description: "Create a new chain" },
    { key: "VIEW_CHAIN", description: "View chain details" },
    { key: "UPDATE_CHAIN", description: "Update chain details" },
    { key: "DELETE_CHAIN", description: "Delete a chain" },
    { key: "ADD_CHAIN_MEMBER", description: "Add co-owner/director to chain" },
    { key: "REMOVE_CHAIN_MEMBER", description: "Remove member from chain" },

    { key: "ONBOARD_MANAGER", description: "Onboard hotel managers" },
    { key: "VIEW_MANAGER", description: "View manager profiles" },
    { key: "UPDATE_MANAGER", description: "Update manager profiles" },
    { key: "DELETE_MANAGER", description: "Delete manager profiles" },
    { key: "SERVICE_OPTIMIZATION", description: "Manage service optimization" },
    { key: "CREATE_ATTACHMENT", description: "Create attachments" },

    { key: "VIEW_CHAIN_REPORTS", description: "View chain-level reports" },
    { key: "EXPORT_CHAIN_REPORTS", description: "Export chain-level reports" },
    { key: "VIEW_HOTEL_REPORTS", description: "View individual hotel reports" },
    { key: "EXPORT_HOTEL_REPORTS", description: "Export hotel reports" },

    // ===== HOTEL STAFF MANAGEMENT =====
    { key: "CREATE_STAFF", description: "Create hotel staff" },
    { key: "VIEW_STAFF", description: "View hotel staff" },
    { key: "UPDATE_STAFF", description: "Update hotel staff" },
    { key: "DELETE_STAFF", description: "Delete hotel staff" },

    { key: "CHECK_IN_GUEST", description: "Check in a guest" },

    { key: "ASSIGN_STAFF_ROLE", description: "Assign role to hotel staff" },
    { key: "BLOCK_STAFF", description: "Block a staff member" },
    { key: "UNBLOCK_STAFF", description: "Unblock a staff member" },

    // ===== CUSTOMER PROFILES =====
    { key: "CREATE_CUSTOMER_PROFILE", description: "Create customer profile" },
    { key: "VIEW_CUSTOMER_PROFILE", description: "View customer profile" },
    { key: "UPDATE_CUSTOMER_PROFILE", description: "Update customer profile" },

    // ===== ORDERS (FOOD + SERVICES) =====
    { key: "CREATE_ORDER", description: "Place an order" },
    { key: "VIEW_ORDER", description: "View orders" },
    { key: "ACCEPT_ORDER", description: "Accept an order" },
    { key: "CANCEL_ORDER", description: "Cancel an order" },
    { key: "UPDATE_ORDER", description: "Update order status" },
    { key: "EDIT_ORDER", description: "Edit an existing order" },
    { key: "REDIRECT_ORDER", description: "Redirect kitchen orders to another panel" },

    // ===== ROOM SERVICES =====
    { key: "CREATE_SERVICE_REQUEST", description: "Create room-service request" },
    { key: "VIEW_SERVICE_REQUEST", description: "View room-service requests" },
    { key: "ACCEPT_SERVICE_REQUEST", description: "Accept room-service request" },
    { key: "CANCEL_SERVICE_REQUEST", description: "Cancel room-service request" },

    // ===== PANEL CONTROLS =====
    { key: "OPEN_KITCHEN_PANEL", description: "Open kitchen panel" },
    { key: "CLOSE_KITCHEN_PANEL", description: "Close kitchen panel" },
    { key: "OPEN_ROOM_SERVICE_PANEL", description: "Open room-service panel" },
    { key: "CLOSE_ROOM_SERVICE_PANEL", description: "Close room-service panel" },

    // ===== MENU =====
    { key: "VIEW_MENU", description: "View menu" },
    { key: "CREATE_MENU", description: "Create menu" },
    { key: "UPDATE_MENU", description: "Update menu" },
    { key: "DELETE_MENU", description: "Delete menu" },

    { key: "VIEW_SERVICE", description: "View services" },
    { key: "CREATE_SERVICE", description: "Create service" },
    { key: "UPDATE_SERVICE", description: "Update service" },
    { key: "DELETE_SERVICE", description: "Delete service" },

    // ===== QR CODES =====
    { key: "VIEW_QR", description: "View QR sets and QR codes" },
    { key: "CREATE_QR", description: "Create QR codes (bulk/single)" },
    { key: "UPDATE_QR", description: "Update QR codes (activate/deactivate)" },

    // ===== AUTH / SYSTEM =====
    { key: "LOGIN", description: "Login to system" },
    { key: "LOGOUT", description: "Logout from system" },
    { key: "RESET_PASSWORD", description: "Reset password" }
];


async function seedPermissions() {
    try {
        await mongoose.connect(process.env.MONGO_URL as string);

        for (const permission of permissions) {
            await Permission.updateOne(
                { key: permission.key },
                { $setOnInsert: permission },
                { upsert: true }
            );
        }

        logger.info("✅ Permissions seeded successfully");
        process.exit(0);
    } catch (error) {
        logger.error("❌ Permission seeding failed", error);
        process.exit(1);
    }
}

export default seedPermissions;