import { getRabbitChannel } from "../../infra/rabbitmq/rabbtmq.js";
import HotelHourlyStats from "./db/hotel-hourly-stats.model.js";
import HotelDailyStats from "./db/hotel-daily-stats.model.js";
import ChainDailyStats from "./db/chain-daily-stats.model.js";

const ANALYTICS_ORDER_EXCHANGE = "analytics.orders.exchange";
const ANALYTICS_ORDER_QUEUE = "analytics.orders.queue";
const ROUTING_KEY = "food_order";

const ORDER_STATUSES = ["PENDING", "PREPARING", "SERVED", "REJECTED", "CANCELLED"] as const;
type OrderStatusKey = (typeof ORDER_STATUSES)[number];

interface FoodOrderAnalyticsPayload {
    event: string;
    orderId: string;
    hotelId: string;
    chainId?: string;
    source: string;
    channelType: string;
    amount: number;
    upsellRevenue?: number;
    totalItemsSold?: number;
    createdAt: string;
    /** Status-change events only */
    previousStatus?: string;
    newStatus?: string;
    servedAt?: string;
    acceptedAt?: string;
    rejectedAt?: string;
}

function parseDate(dateStr: string): { date: string; hour: number } {
    const d = new Date(dateStr);
    const date = d.toISOString().slice(0, 10);
    const hour = d.getUTCHours();
    return { date, hour };
}

function minutesBetween(earlier: string, later: string): number {
    const a = new Date(earlier).getTime();
    const b = new Date(later).getTime();
    return Math.round((b - a) / (60 * 1000));
}

function isValidStatus(s: string): s is OrderStatusKey {
    return ORDER_STATUSES.includes(s as OrderStatusKey);
}

async function handleOrderCreated(payload: FoodOrderAnalyticsPayload): Promise<void> {
    const { date, hour } = parseDate(payload.createdAt);
    const isGuest = payload.source === "GUEST" || payload.source === "STAFF_FOR_GUEST";
    const revenue = payload.amount ?? 0;
    const upsellRevenue = payload.upsellRevenue ?? 0;
    const totalItemsSold = payload.totalItemsSold ?? 0;
    const hasUpsell = upsellRevenue > 0;
    const chainId = payload.chainId ?? "";

    const hourlyInc: Record<string, number> = {
        "food.totalOrders": 1,
        "food.guestOrders": isGuest ? 1 : 0,
        "food.staffOrders": isGuest ? 0 : 1,
        "food.guestRevenue": revenue,
        "food.totalItemsSold": totalItemsSold,
        "food.ordersByStatus.PENDING": 1,
        "overall.totalRevenue": revenue,
        "overall.totalTransactions": 1,
    };
    if (upsellRevenue > 0) {
        hourlyInc["food.upsellRevenue"] = upsellRevenue;
        hourlyInc["food.upsellOrders"] = hasUpsell ? 1 : 0;
        hourlyInc["overall.upsellRevenue"] = upsellRevenue;
        hourlyInc["overall.upsellTransactions"] = hasUpsell ? 1 : 0;
    }

    const dailyInc: Record<string, number> = {
        "food.totalOrders": 1,
        "food.guestOrders": isGuest ? 1 : 0,
        "food.staffOrders": isGuest ? 0 : 1,
        "food.totalRevenue": revenue,
        "food.totalItemsSold": totalItemsSold,
        "food.ordersByStatus.PENDING": 1,
        "overall.totalRevenue": revenue,
        "overall.totalTransactions": 1,
    };
    if (upsellRevenue > 0) {
        dailyInc["food.upsellRevenue"] = upsellRevenue;
        dailyInc["food.upsellOrders"] = hasUpsell ? 1 : 0;
        dailyInc["overall.totalUpsellRevenue"] = upsellRevenue;
        dailyInc["overall.upsellTransactions"] = hasUpsell ? 1 : 0;
    }

    const chainInc: Record<string, number> = {
        "food.totalOrders": 1,
        "food.guestOrders": isGuest ? 1 : 0,
        "food.staffOrders": isGuest ? 0 : 1,
        "food.totalRevenue": revenue,
        "food.totalItemsSold": totalItemsSold,
        "food.ordersByStatus.PENDING": 1,
        "overall.totalRevenue": revenue,
        "overall.totalTransactions": 1,
    };
    if (upsellRevenue > 0) {
        chainInc["food.upsellRevenue"] = upsellRevenue;
        chainInc["food.upsellOrders"] = hasUpsell ? 1 : 0;
        chainInc["overall.totalUpsellRevenue"] = upsellRevenue;
        chainInc["overall.upsellTransactions"] = hasUpsell ? 1 : 0;
    }

    const hourlyUpdate =
        chainId
            ? HotelHourlyStats.findOneAndUpdate(
                  { hotelId: payload.hotelId, date, hour },
                  { $inc: hourlyInc, $set: { chainId } },
                  { upsert: true, new: true }
              )
            : Promise.resolve();

    const dailyUpdate =
        chainId
            ? HotelDailyStats.findOneAndUpdate(
                  { hotelId: payload.hotelId, date },
                  { $inc: dailyInc, $set: { chainId } },
                  { upsert: true, new: true }
              )
            : Promise.resolve();

    const chainUpdate =
        chainId
            ? ChainDailyStats.findOneAndUpdate(
                  { chainId, date },
                  { $inc: chainInc },
                  { upsert: true, new: true }
              )
            : Promise.resolve();

    await Promise.all([hourlyUpdate, dailyUpdate, chainUpdate]);
}

async function handleOrderStatusChange(payload: FoodOrderAnalyticsPayload): Promise<void> {
    const prev = payload.previousStatus && isValidStatus(payload.previousStatus) ? payload.previousStatus : null;
    const next = payload.newStatus && isValidStatus(payload.newStatus) ? payload.newStatus : null;
    if (!prev || !next || prev === next) return;

    const { date, hour } = parseDate(payload.createdAt);
    const chainId = payload.chainId ?? "";
    if (!chainId) return;

    const hourlyInc: Record<string, number> = {
        [`food.ordersByStatus.${prev}`]: -1,
        [`food.ordersByStatus.${next}`]: 1,
    };
    const dailyInc: Record<string, number> = {
        [`food.ordersByStatus.${prev}`]: -1,
        [`food.ordersByStatus.${next}`]: 1,
    };
    const chainInc: Record<string, number> = {
        [`food.ordersByStatus.${prev}`]: -1,
        [`food.ordersByStatus.${next}`]: 1,
    };

    if (next === "REJECTED") {
        hourlyInc["food.rejectedOrders"] = 1;
        dailyInc["food.rejectedOrders"] = 1;
        chainInc["food.rejectedOrders"] = 1;
    }

    if (next === "SERVED" && payload.servedAt && payload.createdAt) {
        const minutes = minutesBetween(payload.createdAt, payload.servedAt);
        if (minutes >= 0) {
            hourlyInc["food.sumTimeToServeMinutes"] = minutes;
            hourlyInc["food.countServedOrders"] = 1;
            dailyInc["food.sumTimeToServeMinutes"] = minutes;
            dailyInc["food.countServedOrders"] = 1;
            chainInc["food.sumTimeToServeMinutes"] = minutes;
            chainInc["food.countServedOrders"] = 1;
        }
    }

    if ((next === "PREPARING" || next === "SERVED") && payload.acceptedAt && payload.createdAt) {
        const minutes = minutesBetween(payload.createdAt, payload.acceptedAt);
        if (minutes >= 0) {
            hourlyInc["food.sumTimeToAcceptMinutes"] = minutes;
            hourlyInc["food.countAcceptedOrders"] = 1;
            dailyInc["food.sumTimeToAcceptMinutes"] = minutes;
            dailyInc["food.countAcceptedOrders"] = 1;
            chainInc["food.sumTimeToAcceptMinutes"] = minutes;
            chainInc["food.countAcceptedOrders"] = 1;
        }
    }

    const hourlyUpdate = HotelHourlyStats.findOneAndUpdate(
        { hotelId: payload.hotelId, date, hour },
        { $inc: hourlyInc },
        { upsert: false }
    );
    const dailyUpdate = HotelDailyStats.findOneAndUpdate(
        { hotelId: payload.hotelId, date },
        { $inc: dailyInc },
        { upsert: false }
    );
    const chainUpdate = ChainDailyStats.findOneAndUpdate(
        { chainId, date },
        { $inc: chainInc },
        { upsert: false }
    );

    await Promise.all([hourlyUpdate, dailyUpdate, chainUpdate]);
}

export const startOrderConsumer = async (): Promise<void> => {
    const channel = getRabbitChannel();
    await channel.assertExchange(ANALYTICS_ORDER_EXCHANGE, "direct", { durable: true });
    await channel.assertQueue(ANALYTICS_ORDER_QUEUE, {
        durable: true,
        arguments: { "x-message-ttl": 1000 * 60 * 60 * 24 * 2 },
    });
    await channel.bindQueue(ANALYTICS_ORDER_QUEUE, ANALYTICS_ORDER_EXCHANGE, ROUTING_KEY);

    console.log(`[Analytics] Consuming from queue: ${ANALYTICS_ORDER_QUEUE}`);

    const statusChangeEvents = new Set([
        "ORDER_ACCEPTED",
        "ORDER_PREPARING",
        "ORDER_SERVED",
        "ORDER_REJECTED",
        "ORDER_CANCELLED",
    ]);

    channel.consume(
        ANALYTICS_ORDER_QUEUE,
        async (msg) => {
            if (!msg) return;
            try {
                const payload: FoodOrderAnalyticsPayload = JSON.parse(msg.content.toString());
                if (payload.event === "ORDER_CREATED") {
                    await handleOrderCreated(payload);
                } else if (statusChangeEvents.has(payload.event)) {
                    await handleOrderStatusChange(payload);
                }
                channel.ack(msg);
            } catch (err) {
                console.error("[Analytics] Order event failed:", err);
                channel.nack(msg, false, false);
            }
        },
        { noAck: false }
    );
};
