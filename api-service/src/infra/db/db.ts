import mongoose from 'mongoose';
import logger from '../../helpers/logger/index.js';
import seedRolePermissions from '../../script/role-permission.js';
import seedRoles from '../../script/role.js';
import seedPermissions from '../../script/permission.js';
import seedAdmin from '../../script/seed-admin.js';

export const connectDB = (url: string) => {
    let dbName = process.env.NODE_ENV === 'development' ? 'app_dev' : 'app';
    let produrl = "mongodb+srv://ayushdubey2017_db_user:qHHzk2g1wcqFdZOJ@tablemitra.gbzqqee.mongodb.net/"
    dbName = "app";
    mongoose
        .connect(produrl, { dbName })
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
