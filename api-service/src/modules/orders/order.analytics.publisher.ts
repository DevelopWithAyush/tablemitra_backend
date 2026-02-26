import { getRabbitChannel } from "../../infra/rabbitmq/rabbtmq.js";
import logger from "../../helpers/logger/index.js";

export const ANALYTICS_ORDER_EXCHANGE = "analytics.orders.exchange";
export const ANALYTICS_ORDER_QUEUE = "analytics.orders.queue";
const ROUTING_KEY = "food_order";

export type FoodOrderAnalyticsEvent =
    | "ORDER_CREATED"
    | "ORDER_ACCEPTED"
    | "ORDER_PREPARING"
    | "ORDER_SERVED"
    | "ORDER_REJECTED"
    | "ORDER_CANCELLED";

export interface FoodOrderAnalyticsPayload {
    event: FoodOrderAnalyticsEvent;
    orderId: string;
    hotelId: string;
    chainId?: string;
    source: "GUEST" | "STAFF_FOR_GUEST" | "STAFF";
    channelType: string;
    /** Total revenue from this order (guest + staff-for-guest only; 0 for STAFF source). Required for ORDER_CREATED. */
    amount: number;
    /** Revenue from upsell items only. Required for ORDER_CREATED. */
    upsellRevenue: number;
    /** Total item count (sum of quantity). Required for ORDER_CREATED. */
    totalItemsSold: number;
    createdAt: string; // ISO
    /** Status-change events: previous and new status for ordersByStatus + time metrics. */
    previousStatus?: string;
    newStatus?: string;
    servedAt?: string; // ISO – for ORDER_SERVED, used for avgTimeToServe
    acceptedAt?: string; // ISO – for ORDER_ACCEPTED/ORDER_PREPARING, used for avgTimeToAccept
    rejectedAt?: string; // ISO – for ORDER_REJECTED
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
