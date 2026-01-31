import {
    connect,
    ChannelModel,
    ConfirmChannel
} from "amqplib";
import logger from "../../helpers/logger/index.js";

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;
let rabbitMQUrl: string | null = null;

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const connectRabbitMQ = async (url: string, retries = 0): Promise<void> => {
    if (connection && channel) return;

    rabbitMQUrl = url;

    try {
        connection = await connect(url);

        connection.on("error", (err) => {
            logger.error("RabbitMQ error:", err);
        });

        connection.on("close", () => {
            logger.warn("RabbitMQ closed. Reconnecting...");
            connection = null;
            channel = null;
            if (rabbitMQUrl) {
                setTimeout(() => connectRabbitMQ(rabbitMQUrl!), RETRY_DELAY_MS);
            }
        });

        channel = await connection.createConfirmChannel();
        await channel.prefetch(10);

        logger.info("RabbitMQ Connected");

        process.on("SIGINT", async () => {
            await channel?.close();
            await connection?.close();
            process.exit(0);
        });

    } catch (error) {
        if (retries < MAX_RETRIES) {
            logger.warn(`RabbitMQ connection failed. Retrying in ${RETRY_DELAY_MS / 1000}s... (${retries + 1}/${MAX_RETRIES})`);
            await sleep(RETRY_DELAY_MS);
            return connectRabbitMQ(url, retries + 1);
        }
        logger.error("RabbitMQ connection failed after max retries:", error);
        process.exit(1);
    }
};

export const getRabbitChannel = (): ConfirmChannel => {
    if (!channel) {
        throw new Error("RabbitMQ not initialized. Call connectRabbitMQ()");
    }
    return channel;
};
