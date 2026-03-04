import { getRabbitChannel } from "../../infra/rabbitmq/rabbtmq.js";
import logger from "../../helpers/logger/index.js";

export const ANALYTICS_SERVICE_REQUEST_EXCHANGE = "analytics.orders.exchange";
export const ANALYTICS_SERVICE_REQUEST_QUEUE = "analytics.service_requests.queue";
const ROUTING_KEY = "service_request";

export type ServiceRequestAnalyticsEvent =
    | "SERVICE_REQUEST_CREATED"
    | "SERVICE_REQUEST_ACCEPTED"
    | "SERVICE_REQUEST_IN_PROGRESS"
    | "SERVICE_REQUEST_COMPLETED"
    | "SERVICE_REQUEST_REJECTED"
    | "SERVICE_REQUEST_CANCELLED";

export interface ServiceRequestAnalyticsPayload {
    event: ServiceRequestAnalyticsEvent;
    requestId: string;
    hotelId: string;
    chainId?: string;
    /** Total monetary value of the request */
    totalAmount: number;
    /** Total number of items (sum of quantity) */
    totalItems: number;
    createdAt: string; // ISO
    /** Status-change events */
    previousStatus?: string;
    newStatus?: string;
    /** ISO timestamps for latency / SLA analytics */
    acceptedAt?: string;
    startedAt?: string;
    completedAt?: string;
    rejectedAt?: string;
    cancelledAt?: string;
}

let queueSetup = false;

const setupQueue = async (): Promise<void> => {
    if (queueSetup) return;
    const channel = getRabbitChannel();
    await channel.assertExchange(ANALYTICS_SERVICE_REQUEST_EXCHANGE, "direct", { durable: true });
    await channel.assertQueue(ANALYTICS_SERVICE_REQUEST_QUEUE, {
        durable: true,
        arguments: { "x-message-ttl": 1000 * 60 * 60 * 24 * 2 }, // 2-day TTL
    });
    await channel.bindQueue(ANALYTICS_SERVICE_REQUEST_QUEUE, ANALYTICS_SERVICE_REQUEST_EXCHANGE, ROUTING_KEY);
    queueSetup = true;
    logger.info("Analytics service-request queue setup complete");
};

export const publishServiceRequestEvent = async (
    payload: ServiceRequestAnalyticsPayload
): Promise<void> => {
    try {
        await setupQueue();
        const channel = getRabbitChannel();
        channel.publish(
            ANALYTICS_SERVICE_REQUEST_EXCHANGE,
            ROUTING_KEY,
            Buffer.from(JSON.stringify(payload)),
            { persistent: true, contentType: "application/json" }
        );
        logger.debug(`Analytics service-request event published: ${payload.event} ${payload.requestId}`);
    } catch (err) {
        logger.error("Failed to publish service-request analytics event:", err);
    }
};
