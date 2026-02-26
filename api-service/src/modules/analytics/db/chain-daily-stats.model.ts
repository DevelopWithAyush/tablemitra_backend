import { Schema, model, Document } from "mongoose";

/**
 * Read-only mirror of analytics-service ChainDailyStats.
 * Same collection for analytics API reads.
 */
export interface IChainDailyStats extends Document {
  chainId: string;
  date: string;
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
    ordersByStatus: { PENDING: number; PREPARING: number; SERVED: number; REJECTED: number; CANCELLED: number };
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
    activeHotelCount: number;
    totalRoomNights: number;
  };
}

const schema = new Schema(
  {
    chainId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    food: { type: Schema.Types.Mixed, default: () => ({}) },
    service: { type: Schema.Types.Mixed, default: () => ({}) },
    overall: { type: Schema.Types.Mixed, default: () => ({}) },
    hotels: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, collection: "chaindailystats" }
);
schema.index({ chainId: 1, date: 1 });

export default model<IChainDailyStats>("ChainDailyStats", schema);
