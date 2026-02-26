/**
 * Analytics API types. All revenue responses include upsell at hotel and chain level.
 */

export type GroupBy = "day" | "week" | "month" | "hour";

export interface AnalyticsDateRangeQuery {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  groupBy?: GroupBy;
}

/** Period key for timeseries: date (YYYY-MM-DD), week (Monday date), month (YYYY-MM), or date+hour. */
export interface RevenueDataPoint {
  period: string;
  revenue: number;
  foodRevenue: number;
  serviceRevenue: number;
  upsellRevenue: number;
  upsellOrders?: number;
}

export interface OrdersDataPoint {
  period: string;
  foodOrders: number;
  serviceOrders: number;
}

export interface OrdersByStatus {
  PENDING: number;
  PREPARING: number;
  SERVED: number;
  REJECTED: number;
  CANCELLED: number;
  _percentages?: Record<string, number>;
}

export interface FoodMetrics {
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
  peakHour: number;
  lowestHour: number;
  ordersByStatus?: OrdersByStatus;
}

export interface ServiceMetrics {
  totalRequests: number;
  completedRequests: number;
  cancelledRequests: number;
  paidRevenue: number;
  averageServiceValue: number;
  avgCompletionTimeMinutes: number;
}

export interface OverallMetrics {
  totalRevenue: number;
  totalTransactions: number;
  totalUpsellRevenue: number;
  upsellTransactions: number;
  averageTransactionValue: number;
  upsellContributionRate: number;
}

export interface AnalyticsSummary {
  food: FoodMetrics;
  service: ServiceMetrics;
  overall: OverallMetrics;
  ordersByStatus?: OrdersByStatus;
}

export interface SummaryResponse {
  current: AnalyticsSummary;
  previous?: AnalyticsSummary;
}

export interface OperationalMetrics {
  acceptanceRate: number;
  rejectionRate: number;
  avgTimeToAcceptMinutes: number;
  avgTimeToServeMinutes: number;
  peakHour: number;
  lowestHour: number;
  upsellConversionRate: number;
  upsellRevenue: number;
  upsellContributionRate: number;
}

export interface HotelRankingItem {
  hotelId: string;
  hotelName?: string;
  revenue: number;
  foodRevenue: number;
  serviceRevenue: number;
  upsellRevenue: number;
  foodOrders: number;
  serviceOrders: number;
}
