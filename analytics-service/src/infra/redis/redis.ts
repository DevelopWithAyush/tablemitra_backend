import { createClient } from "redis";
import logger from '../../helpers/logger/index.js';

let redisClient: ReturnType<typeof createClient>;

export const connectRedis = async (url: string) => {
    if (redisClient) return redisClient;

    redisClient = createClient({
        url: url,
        socket: {
            reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
        },
    });

    redisClient.on("connect", () => {
        logger.info("Redis connected");
    });

    redisClient.on("error", (err) => {
        logger.error("Redis error:", err);
    });

    await redisClient.connect();
    return redisClient;
};

export const getRedis = () => {
    if (!redisClient) {
        logger.error("Redis not initialized. Call connectRedis() first.");
        throw new Error("Redis not initialized. Call connectRedis() first.");
    }
    return redisClient;
};
