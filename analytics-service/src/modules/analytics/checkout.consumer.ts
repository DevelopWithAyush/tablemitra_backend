import { getRabbitChannel } from "../../infra/rabbitmq/rabbtmq.js";
import HotelHourlyStats from "./db/hotel-hourly-stats.model.js";
import HotelDailyStats from "./db/hotel-daily-stats.model.js";
import ChainDailyStats from "./db/chain-daily-stats.model.js";

const ANALYTICS_CHECKOUT_EXCHANGE = "analytics.orders.exchange";
const ANALYTICS_CHECKOUT_QUEUE = "analytics.checkout.queue";
const ROUTING_KEY = "checkout";

interface CheckoutAnalyticsPayload {
    event: string;
    checkoutSessionId: string;
    hotelId: string;
    chainId?: string;
    roomNumber: string;
    finalAmount: number;
    totalDiscountAmount: number;
    totalDamageCharges: number;
    totalOtherCharges: number;
    paymentMethod: string;
    paidAt: string;
}

function parseDate(dateStr: string): { date: string; hour: number } {
    const d = new Date(dateStr);
    const date = d.toISOString().slice(0, 10);
    const hour = d.getUTCHours();
    return { date, hour };
}

async function handleCheckout(payload: CheckoutAnalyticsPayload): Promise<void> {
    const { date, hour } = parseDate(payload.paidAt);
    const chainId = payload.chainId ?? "";
    if (!chainId) return;

    const discountAmount = payload.totalDiscountAmount ?? 0;
    const damageCharges = payload.totalDamageCharges ?? 0;
    const otherCharges = payload.totalOtherCharges ?? 0;
    const finalAmount = payload.finalAmount ?? 0;

    const inc = {
        "checkout.checkoutsCount": 1,
        "checkout.totalDiscountAmount": discountAmount,
        "checkout.totalDamageCharges": damageCharges,
        "checkout.totalOtherCharges": otherCharges,
        "checkout.totalFinalAmount": finalAmount,
    };

    const hourlyUpdate = HotelHourlyStats.findOneAndUpdate(
        { hotelId: payload.hotelId, date, hour },
        { $inc: inc, $set: { chainId } },
        { upsert: true }
    );

    const dailyUpdate = HotelDailyStats.findOneAndUpdate(
        { hotelId: payload.hotelId, date },
        { $inc: inc, $set: { chainId } },
        { upsert: true }
    );

    const chainUpdate = ChainDailyStats.findOneAndUpdate(
        { chainId, date },
        { $inc: inc },
        { upsert: true }
    );

    const occupancyUpdate = HotelDailyStats.findOneAndUpdate(
        { hotelId: payload.hotelId, date },
        { $inc: { "occupancy.roomsCheckedOut": 1 } },
        { upsert: true }
    );

    await Promise.all([hourlyUpdate, dailyUpdate, chainUpdate, occupancyUpdate]);
}

export const startCheckoutConsumer = async (): Promise<void> => {
    const channel = getRabbitChannel();
    await channel.assertExchange(ANALYTICS_CHECKOUT_EXCHANGE, "direct", { durable: true });
    await channel.assertQueue(ANALYTICS_CHECKOUT_QUEUE, {
        durable: true,
        arguments: { "x-message-ttl": 1000 * 60 * 60 * 24 * 2 },
    });
    await channel.bindQueue(ANALYTICS_CHECKOUT_QUEUE, ANALYTICS_CHECKOUT_EXCHANGE, ROUTING_KEY);

    console.log(`[Analytics] Consuming checkout from queue: ${ANALYTICS_CHECKOUT_QUEUE}`);

    channel.consume(
        ANALYTICS_CHECKOUT_QUEUE,
        async (msg) => {
            if (!msg) return;
            try {
                const payload: CheckoutAnalyticsPayload = JSON.parse(msg.content.toString());
                if (payload.event === "GUEST_CHECKED_OUT") {
                    await handleCheckout(payload);
                }
                channel.ack(msg);
            } catch (err) {
                console.error("[Analytics] Checkout event failed:", err);
                channel.nack(msg, false, false);
            }
        },
        { noAck: false }
    );
};
