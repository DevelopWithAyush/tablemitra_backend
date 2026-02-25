import { getRabbitChannel } from "../../infra/rabbitmq/rabbtmq.js";
import logger from "../../helpers/logger/index.js";

export const ANALYTICS_ORDER_EXCHANGE = "analytics.orders.exchange";
export const ANALYTICS_ORDER_QUEUE = "analytics.orders.queue";
const ROUTING_KEY = "food_order";

export interface FoodOrderAnalyticsPayload {
    event: "ORDER_CREATED" | "ORDER_ACCEPTED" | "ORDER_REJECTED" | "ORDER_PREPARING" | "ORDER_SERVED" | "ORDER_CANCELLED";
    orderId: string;
    hotelId: string;
    chainId?: string;
    source: "GUEST" | "STAFF_FOR_GUEST" | "STAFF";
    channelType: string;
    /** Total revenue from this order (guest + staff-for-guest only; 0 for STAFF source). */
    amount: number;
    /** Revenue from upsell items only (items with isUpsell: true). Sum of (discountedPrice ?? price) * quantity per upsell line. */
    upsellRevenue: number;
    /** Total item count (sum of quantity across all items). For analytics totalItemsSold. */
    totalItemsSold: number;
    createdAt: string; // ISO
    /** Set when event is status change (e.g. ORDER_SERVED). */
    servedAt?: string;
}

let queueSetup = false;

const setupQueue = async (): Promise<void> => {
    if (queueSetup) return;
    const channel = getRabbitChannel();
    await channel.assertExchange(ANALYTICS_ORDER_EXCHANGE, "direct", { durable: true });
    await channel.assertQueue(ANALYTICS_ORDER_QUEUE, {
        durable: true,
        arguments: { "x-message-ttl": 1000 * 60 * 60 * 24 * 2 },
    });
    await channel.bindQueue(ANALYTICS_ORDER_QUEUE, ANALYTICS_ORDER_EXCHANGE, ROUTING_KEY);
    queueSetup = true;
    logger.info("Analytics order queue setup complete");
};

export const publishFoodOrderEvent = async (payload: FoodOrderAnalyticsPayload): Promise<void> => {
    try {
        await setupQueue();
        const channel = getRabbitChannel();
        channel.publish(
            ANALYTICS_ORDER_EXCHANGE,
            ROUTING_KEY,
            Buffer.from(JSON.stringify(payload)),
            { persistent: true, contentType: "application/json" }
        );
        logger.debug(`Analytics order event published: ${payload.event} ${payload.orderId}`);
    } catch (err) {
        logger.error("Failed to publish food order analytics event:", err);
    }
};
