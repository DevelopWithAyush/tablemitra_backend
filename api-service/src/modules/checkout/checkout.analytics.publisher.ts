import { getRabbitChannel } from "../../infra/rabbitmq/rabbtmq.js";
import logger from "../../helpers/logger/index.js";

export const ANALYTICS_CHECKOUT_EXCHANGE = "analytics.orders.exchange";
const ROUTING_KEY = "checkout";

export interface CheckoutAnalyticsPayload {
    event: "GUEST_CHECKED_OUT";
    checkoutSessionId: string;
    hotelId: string;
    chainId?: string;
    roomNumber: string;
    finalAmount: number;
    totalDiscountAmount: number;
    totalDamageCharges: number;
    totalOtherCharges: number;
    paymentMethod: string;
    paidAt: string; // ISO
}

let queueSetup = false;

const setupQueue = async (): Promise<void> => {
    if (queueSetup) return;
    const channel = getRabbitChannel();
    await channel.assertExchange(ANALYTICS_CHECKOUT_EXCHANGE, "direct", { durable: true });
    queueSetup = true;
    logger.info("Analytics checkout queue setup complete");
};

export const publishCheckoutEvent = async (payload: CheckoutAnalyticsPayload): Promise<void> => {
    try {
        await setupQueue();
        const channel = getRabbitChannel();
        channel.publish(
            ANALYTICS_CHECKOUT_EXCHANGE,
            ROUTING_KEY,
            Buffer.from(JSON.stringify(payload)),
            { persistent: true, contentType: "application/json" }
        );
        logger.debug(`Analytics checkout event published: ${payload.event} ${payload.checkoutSessionId}`);
    } catch (err) {
        logger.error("Failed to publish checkout analytics event:", err);
    }
};
