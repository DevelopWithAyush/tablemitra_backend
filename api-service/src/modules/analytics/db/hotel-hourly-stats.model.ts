import { Schema, model, Document } from "mongoose";

/**
 * Read-only mirror of analytics-service HotelHourlyStats.
 * Same collection for analytics API reads.
 */
export interface IHotelHourlyStats extends Document {
  hotelId: string;
  chainId: string;
  date: string;
  hour: number;
  food: {
    totalOrders: number;
    guestOrders: number;
    staffOrders: number;
    guestRevenue: number;
    totalItemsSold: number;
    upsellRevenue: number;
    upsellOrders: number;
    averageOrderValue: number;
    rejectedOrders: number;
    acceptanceRate: number;
    avgTimeToAcceptMinutes: number;
    avgTimeToServeMinutes: number;
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
    averageTransactionValue: number;
    upsellRevenue: number;
    upsellTransactions: number;
    upsellContributionRate: number;
  };
}

const schema = new Schema(
  {
    hotelId: { type: String, required: true, index: true },
    chainId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    hour: { type: Number, required: true },
    food: { type: Schema.Types.Mixed, default: () => ({}) },
    service: { type: Schema.Types.Mixed, default: () => ({}) },
    overall: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, collection: "hotelhourlystats" }
);
schema.index({ hotelId: 1, date: 1, hour: 1 });
schema.index({ chainId: 1, date: 1, hour: 1 });

export default model<IHotelHourlyStats>("HotelHourlyStats", schema);
