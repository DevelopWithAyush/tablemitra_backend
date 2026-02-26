import { Schema, model, Document } from "mongoose";

/**
 * Hotel-level daily aggregates for manager reports and trends.
 * Revenue and AOV use guest orders only; staff orders are excluded from revenue.
 */
export interface IHotelDailyStats extends Document {
  hotelId: string;
  chainId: string;
  date: string; // YYYY-MM-DD

  food: {
    totalOrders: number;
    guestOrders: number;
    staffOrders: number;
    totalRevenue: number;   // guest + staff-for-guest only
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
    avgTimeToCompleteMinutes: number; // created → served
    peakHour: number;        // hour with most orders (0-23)
    lowestHour: number;      // hour with fewest orders (0-23)
    /** Status counts for pie/breakdown. Updated on ORDER_CREATED + status-change events. */
    ordersByStatus: {
      PENDING: number;
      PREPARING: number;
      SERVED: number;
      REJECTED: number;
      CANCELLED: number;
    };
    /** For computing avgTimeToServe: sum of (servedAt - createdAt) in minutes. */
    sumTimeToServeMinutes: number;
    countServedOrders: number;
    /** For computing avgTimeToAccept: sum of (acceptedAt - createdAt) in minutes. */
    sumTimeToAcceptMinutes: number;
    countAcceptedOrders: number;
  };

  service: {
    totalRequests: number;
    completedRequests: number;
    cancelledRequests: number;
    cancellationRate: number;
    paidRequests: number;
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
    occupancyRate: number;  // 0-1, if total rooms available is known
  };
}

const HotelDailyStatsSchema = new Schema<IHotelDailyStats>(
  {
    hotelId: { type: String, required: true, index: true },
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
      acceptanceRate: { type: Number, default: 0 },
      avgTimeToAcceptMinutes: { type: Number, default: 0 },
      avgTimeToServeMinutes: { type: Number, default: 0 },
      avgTimeToCompleteMinutes: { type: Number, default: 0 },
      peakHour: { type: Number, default: 0 },
      lowestHour: { type: Number, default: 0 },
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
      cancellationRate: { type: Number, default: 0 },
      paidRequests: { type: Number, default: 0 },
      paidRevenue: { type: Number, default: 0 },
      averageServiceValue: { type: Number, default: 0 },
      avgCompletionTimeMinutes: { type: Number, default: 0 },
    },

    overall: {
      totalRevenue: { type: Number, default: 0 },
      totalTransactions: { type: Number, default: 0 },
      totalUpsellRevenue: { type: Number, default: 0 },
      upsellTransactions: { type: Number, default: 0 },
      averageTransactionValue: { type: Number, default: 0 },
      upsellContributionRate: { type: Number, default: 0 },
    },

    occupancy: {
      roomsCheckedIn: { type: Number, default: 0 },
      roomsCheckedOut: { type: Number, default: 0 },
      roomNights: { type: Number, default: 0 },
      occupancyRate: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

HotelDailyStatsSchema.index(
  { hotelId: 1, date: 1 },
  { unique: true }
);
HotelDailyStatsSchema.index({ chainId: 1, date: 1 });

export default model<IHotelDailyStats>(
  "HotelDailyStats",
  HotelDailyStatsSchema
);
