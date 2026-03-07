import mongoose from "mongoose";
import dotenv from "dotenv";
import Admin from "../modules/company/db/admin-profile.model.js";
import Role from "../modules/auth/db/role.model.js";
import UserRole from "../modules/auth/db/user-role.model.js";
import logger from "../helpers/logger/index.js";

dotenv.config();

const ADMIN_USER_ID = "69abc52ed842e95b23d7fde5";

async function seedAdmin() {
    try {
        // await mongoose.connect(process.env.MONGO_URL as string);

        const adminRole = await Role.findOne({ key: "ADMIN" });
        if (!adminRole) {
            logger.error("❌ ADMIN role not found. Run role seeding first.");
            process.exit(1);
        }

        await Admin.updateOne(
            { userId: new mongoose.Types.ObjectId(ADMIN_USER_ID) },
            {
                $setOnInsert: {
                    userId: new mongoose.Types.ObjectId(ADMIN_USER_ID),
                    name: "Super Admin",
                    email: "admin@tablemitra.com",
                    isEmailVerified: true,
                    isActive: true,
                },
            },
            { upsert: true }
        );

        await UserRole.updateOne(
            {
                userId: new mongoose.Types.ObjectId(ADMIN_USER_ID),
                roleId: adminRole._id,
                contextType: "GLOBAL",
            },
            {
                $setOnInsert: {
                    userId: new mongoose.Types.ObjectId(ADMIN_USER_ID),
                    roleId: adminRole._id,
                    contextType: "GLOBAL",
                    contextId: null,
                    isActive: true,
                    isDeleted: false,
                    isBlocked: false,
                },
            },
            { upsert: true }
        );

        logger.info("✅ Admin seeded successfully");
        logger.info(`   User ID: ${ADMIN_USER_ID}`);
        logger.info(`   Role: ADMIN (${adminRole._id})`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        logger.error("❌ Admin seeding failed", error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

export default seedAdmin;
