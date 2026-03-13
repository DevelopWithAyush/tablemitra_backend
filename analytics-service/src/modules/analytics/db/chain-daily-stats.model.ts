import { Schema, model, Document } from "mongoose";

/**
 * Chain-level daily roll-up across all hotels for the chain.
 * Revenue and order metrics use guest orders only (staff orders excluded).
 */
export interface IChainDailyStats extends Document {
  chainId: string;
  date: string; // YYYY-MM-DD

  food: {
    totalOrders: number;
    guestOrders: number;
    staffOrders: number;
    totalRevenue: number;
    totalItemsSold: number;
    upsellRevenue: number;
    upsellOrders: number;
    averageOrderValue: number;
    upsellConversionRate: number;
    rejectedOrders: number;
    rejectionRate: number;
    avgTimeToCompleteMinutes: number;
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
    totalRevenue: number;
    totalTransactions: number;
    totalUpsellRevenue: number;
    upsellTransactions: number;
    averageTransactionValue: number;
    upsellContributionRate: number;
  };

  hotels: {
    activeHotelCount: number;  // hotels with at least one order/request that day
    totalRoomNights: number;
  };

  checkout?: {
    checkoutsCount: number;
    totalDiscountAmount: number;
    totalDamageCharges: number;
    totalOtherCharges: number;
    totalFinalAmount: number;
  };
}

const ChainDailyStatsSchema = new Schema<IChainDailyStats>(
  {
    chainId: { type: String, required: true, index: true },
    date: { type: String, required: true },

    food: {
      totalOrders: { type: Number, default: 0 },
      guestOrders: { type: Number, default: 0 },
      staffOrders: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      totalItemsSold: { type: Number, default: 0 },
      upsellRevenue: { type: Number, default: 0 },
      upsellOrders: { type: Number, default: 0 },
      averageOrderValue: { type: Number, default: 0 },
      upsellConversionRate: { type: Number, default: 0 },
      rejectedOrders: { type: Number, default: 0 },
      rejectionRate: { type: Number, default: 0 },
      avgTimeToCompleteMinutes: { type: Number, default: 0 },
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
      totalUpsellRevenue: { type: Number, default: 0 },
      upsellTransactions: { type: Number, default: 0 },
      averageTransactionValue: { type: Number, default: 0 },
      upsellContributionRate: { type: Number, default: 0 },
    },

    hotels: {
      activeHotelCount: { type: Number, default: 0 },
      totalRoomNights: { type: Number, default: 0 },
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

ChainDailyStatsSchema.index(
  { chainId: 1, date: 1 },
  { unique: true }
);

export default model<IChainDailyStats>(
  "ChainDailyStats",
  ChainDailyStatsSchema
);
