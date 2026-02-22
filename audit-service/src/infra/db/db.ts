import mongoose from 'mongoose';
import logger from '../../helpers/logger/index.js';

export const connectDB = (url: string) => {
    const dbName = process.env.NODE_ENV === 'development' ? 'app_dev' : 'app';

    mongoose
        .connect(url, { dbName })
        .then((data) => {
            logger.info(`Connected to DB: ${data.connection.host}/${dbName}`);
        })
        .catch((err) => {
            logger.error("MongoDB connection failed:", err.message);
            process.exit(1);
        });
};
