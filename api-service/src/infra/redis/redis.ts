import { createClient, createCluster } from "redis";
import logger from "../../helpers/logger/index.js";

type RedisClient = ReturnType<typeof createClient> | ReturnType<typeof createCluster>;

let redisClient: RedisClient;

export const connectRedis = async (url: string) => {
  if (redisClient) return redisClient;

  const isCluster = process.env.REDIS_CLUSTER === "true";

  if (isCluster) {
    redisClient = createCluster({
      rootNodes: [{ url }],
      defaults: {
        socket: {
          tls: true,
          reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
        },
      },
    });
    redisClient.on("connect", () => logger.info("Redis Cluster connected"));
    redisClient.on("error", (err) => logger.error("Redis Cluster error:", err));
  } else {
    redisClient = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
      },
    });
    redisClient.on("connect", () => logger.info("Redis connected"));
    redisClient.on("error", (err) => logger.error("Redis error:", err));
  }

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


