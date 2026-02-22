import { createCluster } from "redis";
import logger from "../../helpers/logger/index.js";

let redisClient: ReturnType<typeof createCluster>;

export const connectRedis = async (url: string) => {
  if (redisClient) return redisClient;

  redisClient = createCluster({
    rootNodes: [
      {
        url:"rediss://clustercfg.tenmedz.b3kagz.aps1.cache.amazonaws.com:6379", // must be rediss://
      },
    ],
    defaults: {
      socket: {
        tls: true, // REQUIRED because transit encryption is enabled
        reconnectStrategy: (retries) =>
          Math.min(retries * 50, 2000),
      },
    },
  });

  redisClient.on("connect", () => {
    logger.info("Redis Cluster connected");
  });

  redisClient.on("error", (err) => {
    logger.error("Redis Cluster error:", err);
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