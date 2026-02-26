import { Schema, model, Document } from "mongoose";

/**
 * Read-only mirror of analytics-service HotelDailyStats.
 * Same collection (hoteldailystats) for analytics API reads.
 */
export interface IHotelDailyStats extends Document {
  hotelId: string;
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
    acceptanceRate: number;
    avgTimeToAcceptMinutes: number;
    avgTimeToServeMinutes: number;
    avgTimeToCompleteMinutes: number;
    peakHour: number;
    lowestHour: number;
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
  occupancy?: {
    roomsCheckedIn: number;
    roomsCheckedOut: number;
    roomNights: number;
    occupancyRate: number;
  };
}

const schema = new Schema(
  {
    hotelId: { type: String, required: true, index: true },
    chainId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    food: { type: Schema.Types.Mixed, default: () => ({}) },
    service: { type: Schema.Types.Mixed, default: () => ({}) },
    overall: { type: Schema.Types.Mixed, default: () => ({}) },
    occupancy: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, collection: "hoteldailystats" }
);
schema.index({ hotelId: 1, date: 1 });
schema.index({ chainId: 1, date: 1 });

export default model<IHotelDailyStats>("HotelDailyStats", schema);
