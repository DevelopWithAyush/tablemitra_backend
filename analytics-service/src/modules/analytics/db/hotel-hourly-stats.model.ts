import { Schema, model, Document } from "mongoose";

/**
 * Hotel-level hourly aggregates for manager dashboards.
 * Revenue and order-value metrics use guest orders only (staff orders excluded from revenue).
 */
export interface IHotelHourlyStats extends Document {
  hotelId: string;
  chainId: string;
  date: string; // YYYY-MM-DD
  hour: number; // 0-23

  food: {
    totalOrders: number;
    guestOrders: number;
    staffOrders: number;
    guestRevenue: number; // revenue from guest + staff-for-guest orders only
    totalItemsSold: number;
    upsellRevenue: number;
    upsellOrders: number;
    averageOrderValue: number;
    rejectedOrders: number;
    acceptanceRate: number; // accepted / (accepted + rejected)
    avgTimeToAcceptMinutes: number; // created → accepted (needs acceptedAt on order)
    avgTimeToServeMinutes: number;  // created → served (needs servedAt on order)
    ordersByStatus: {
      PENDING: number;
      PREPARING: number;
      SERVED: number;
      REJECTED: number;
      CANCELLED: number;
    };
    sumTimeToServeMinutes: number;
    countServedOrders: number;
    sumTimeToAcceptMinutes: number;
    countAcceptedOrders: number;
  };

  service: {
    totalRequests: number;
    completedRequests: number;
    cancelledRequests: number;
    paidRevenue: number;
    averageServiceValue: number;
    avgCompletionTimeMinutes: number;
    cancellationRate: number;
  };

  overall: {
    totalRevenue: number;   // guest-only
    totalTransactions: number;
    averageTransactionValue: number;
    upsellRevenue: number;
    upsellTransactions: number;
    upsellContributionRate: number;
  };

  checkout?: {
    checkoutsCount: number;
    totalDiscountAmount: number;
    totalDamageCharges: number;
    totalOtherCharges: number;
    totalFinalAmount: number;
  };
}

const HotelHourlyStatsSchema = new Schema<IHotelHourlyStats>(
  {
    hotelId: { type: String, required: true, index: true },
    chainId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    hour: { type: Number, required: true },

    food: {
      totalOrders: { type: Number, default: 0 },
      guestOrders: { type: Number, default: 0 },
      staffOrders: { type: Number, default: 0 },
      guestRevenue: { type: Number, default: 0 },
      totalItemsSold: { type: Number, default: 0 },
      upsellRevenue: { type: Number, default: 0 },
      upsellOrders: { type: Number, default: 0 },
      averageOrderValue: { type: Number, default: 0 },
      rejectedOrders: { type: Number, default: 0 },
      acceptanceRate: { type: Number, default: 0 },
      avgTimeToAcceptMinutes: { type: Number, default: 0 },
      avgTimeToServeMinutes: { type: Number, default: 0 },
      ordersByStatus: {
        PENDING: { type: Number, default: 0 },
        PREPARING: { type: Number, default: 0 },
        SERVED: { type: Number, default: 0 },
        REJECTED: { type: Number, default: 0 },
        CANCELLED: { type: Number, default: 0 },
      },
      sumTimeToServeMinutes: { type: Number, default: 0 },
      countServedOrders: { type: Number, default: 0 },
      sumTimeToAcceptMinutes: { type: Number, default: 0 },
      countAcceptedOrders: { type: Number, default: 0 },
    },

    service: {
      totalRequests: { type: Number, default: 0 },
      completedRequests: { type: Number, default: 0 },
      cancelledRequests: { type: Number, default: 0 },
      paidRevenue: { type: Number, default: 0 },
      averageServiceValue: { type: Number, default: 0 },
      avgCompletionTimeMinutes: { type: Number, default: 0 },
      cancellationRate: { type: Number, default: 0 },
    },

    overall: {
      totalRevenue: { type: Number, default: 0 },
      totalTransactions: { type: Number, default: 0 },
      averageTransactionValue: { type: Number, default: 0 },
      upsellRevenue: { type: Number, default: 0 },
      upsellTransactions: { type: Number, default: 0 },
      upsellContributionRate: { type: Number, default: 0 },
    },

    checkout: {
      checkoutsCount: { type: Number, default: 0 },
      totalDiscountAmount: { type: Number, default: 0 },
      totalDamageCharges: { type: Number, default: 0 },
      totalOtherCharges: { type: Number, default: 0 },
      totalFinalAmount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

HotelHourlyStatsSchema.index(
  { hotelId: 1, date: 1, hour: 1 },
  { unique: true }
);
HotelHourlyStatsSchema.index({ chainId: 1, date: 1, hour: 1 });

export default model<IHotelHourlyStats>(
  "HotelHourlyStats",
  HotelHourlyStatsSchema
);
