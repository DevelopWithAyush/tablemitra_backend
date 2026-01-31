import mongoose from "mongoose";
import Role from "../modules/auth/db/role.model.js";
import dotenv from "dotenv";
import logger from "../helpers/logger/index.js";

dotenv.config();

const roles = [
    {
        key: "ADMIN",
        scope: "GLOBAL",
        level: 100
    },
    {
        key: "FOUNDER",
        scope: "GLOBAL",
        level: 90
    },
    {
        key: "CUSTOMER_CARE",
        scope: "GLOBAL",
        level: 80
    },
    {
        key: "SALES",
        scope: "GLOBAL",
        level: 70
    },
    {
        key: "MANAGER",
        scope: "HOTEL",
        level: 60
    },
    {
        key: "FRONTDESK",
        scope: "HOTEL",
        level: 50
    },
    {
        key: "KITCHEN",
        scope: "HOTEL",
        level: 40
    },
    {
        key: "ROOM_SERVICE",
        scope: "HOTEL",
        level: 30
    },
    {
        key: "CUSTOMER",
        scope: "GLOBAL",
        level: 10
    },
];

async function seedRoles() {
    try {
        await mongoose.connect(process.env.MONGO_URL as string);

        for (const role of roles) {
            await Role.updateOne(
                { key: role.key },
                { $setOnInsert: role },
                { upsert: true }
            );
        }

        logger.info("✅ Roles seeded successfully");
        process.exit(0);
    } catch (error) {
        logger.error("❌ Role seeding failed", error);
        process.exit(1);
    }
}

export default seedRoles;
