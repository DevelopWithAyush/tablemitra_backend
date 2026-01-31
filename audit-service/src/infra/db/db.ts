import mongoose from 'mongoose';
import logger from '../../helpers/logger/index.js';
import seedRolePermissions from '../../script/role-permission.js';
import seedRoles from '../../script/role.js';
import seedPermissions from '../../script/permission.js';
import seedAdmin from '../../script/seed-admin.js';

export const connectDB = (url: string) => {
    const dbName = process.env.NODE_ENV === 'development' ? 'app_dev' : 'app';

    mongoose
        .connect(url, { dbName })
        .then((data) => {
            logger.info(`Connected to DB: ${data.connection.host}/${dbName}`);
            // seedRoles();
            // seedPermissions();
            // seedRolePermissions();
            // seedAdmin();
        })
        .catch((err) => {
            logger.error("MongoDB connection failed:", err.message);
            process.exit(1);
        });
};
