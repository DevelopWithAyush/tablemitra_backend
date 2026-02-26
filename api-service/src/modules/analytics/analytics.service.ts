import type { PipelineStage } from "mongoose";
import HotelDailyStats from "./db/hotel-daily-stats.model.js";
import HotelHourlyStats from "./db/hotel-hourly-stats.model.js";
import ChainDailyStats from "./db/chain-daily-stats.model.js";
import type {
  SummaryResponse,
  RevenueDataPoint,
  OrdersDataPoint,
  OrdersByStatus,
  OperationalMetrics,
  HotelRankingItem,
  AnalyticsSummary,
} from "./analytics.types.js";

const GROUPBY_MAX_DAYS_HOUR = 31;

function getPreviousRange(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const prevTo = new Date(fromDate);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - days + 1);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return d.toISOString().slice(0, 10);
}

function normalizeDocToSummary(doc: Record<string, unknown> | null): AnalyticsSummary {
  if (!doc) {
    return {
      food: {
        totalOrders: 0, guestOrders: 0, staffOrders: 0, totalRevenue: 0, totalItemsSold: 0,
        upsellRevenue: 0, upsellOrders: 0, averageOrderValue: 0, upsellConversionRate: 0,
        rejectedOrders: 0, rejectionRate: 0, acceptanceRate: 0, avgTimeToAcceptMinutes: 0,
        avgTimeToServeMinutes: 0, peakHour: 0, lowestHour: 0,
      },
      service: {
        totalRequests: 0, completedRequests: 0, cancelledRequests: 0, paidRevenue: 0,
        averageServiceValue: 0, avgCompletionTimeMinutes: 0,
      },
      overall: {
        totalRevenue: 0, totalTransactions: 0, totalUpsellRevenue: 0, upsellTransactions: 0,
        averageTransactionValue: 0, upsellContributionRate: 0,
      },
    };
  }
  const food = (doc.food as Record<string, unknown>) ?? {};
  const service = (doc.service as Record<string, unknown>) ?? {};
  const overall = (doc.overall as Record<string, unknown>) ?? {};
  const sumServe = (food.sumTimeToServeMinutes as number) ?? 0;
  const countServe = (food.countServedOrders as number) ?? 0;
  const sumAccept = (food.sumTimeToAcceptMinutes as number) ?? 0;
  const countAccept = (food.countAcceptedOrders as number) ?? 0;
  return {
    food: {
      totalOrders: (food.totalOrders as number) ?? 0,
      guestOrders: (food.guestOrders as number) ?? 0,
      staffOrders: (food.staffOrders as number) ?? 0,
      totalRevenue: (food.totalRevenue as number) ?? 0,
      totalItemsSold: (food.totalItemsSold as number) ?? 0,
      upsellRevenue: (food.upsellRevenue as number) ?? 0,
      upsellOrders: (food.upsellOrders as number) ?? 0,
      averageOrderValue: (food.averageOrderValue as number) ?? 0,
      upsellConversionRate: (food.upsellConversionRate as number) ?? 0,
      rejectedOrders: (food.rejectedOrders as number) ?? 0,
      rejectionRate: (food.rejectionRate as number) ?? 0,
      acceptanceRate: (food.acceptanceRate as number) ?? 0,
      avgTimeToAcceptMinutes: countAccept > 0 ? sumAccept / countAccept : 0,
      avgTimeToServeMinutes: countServe > 0 ? sumServe / countServe : 0,
      peakHour: (food.peakHour as number) ?? 0,
      lowestHour: (food.lowestHour as number) ?? 0,
      ordersByStatus: food.ordersByStatus as OrdersByStatus | undefined,
    },
    service: {
      totalRequests: (service.totalRequests as number) ?? 0,
      completedRequests: (service.completedRequests as number) ?? 0,
      cancelledRequests: (service.cancelledRequests as number) ?? 0,
      paidRevenue: (service.paidRevenue as number) ?? 0,
      averageServiceValue: (service.averageServiceValue as number) ?? 0,
      avgCompletionTimeMinutes: (service.avgCompletionTimeMinutes as number) ?? 0,
    },
    overall: {
      totalRevenue: (overall.totalRevenue as number) ?? 0,
      totalTransactions: (overall.totalTransactions as number) ?? 0,
      totalUpsellRevenue: (overall.totalUpsellRevenue as number) ?? 0,
      upsellTransactions: (overall.upsellTransactions as number) ?? 0,
      averageTransactionValue: (overall.averageTransactionValue as number) ?? 0,
      upsellContributionRate: (overall.upsellContributionRate as number) ?? 0,
    },
  };
}

export const analyticsService = {
  getHotelSummary: async (
    hotelId: string,
    from: string,
    to: string,
    compareWithPrevious = false
  ): Promise<SummaryResponse> => {
    const match = { hotelId, date: { $gte: from, $lte: to } };
    const pipeline: Record<string, unknown>[] = [
      { $match: match },
      {
        $group: {
          _id: null,
          f_totalOrders: { $sum: "$food.totalOrders" },
          f_guestOrders: { $sum: "$food.guestOrders" },
          f_staffOrders: { $sum: "$food.staffOrders" },
          f_totalRevenue: { $sum: "$food.totalRevenue" },
          f_totalItemsSold: { $sum: "$food.totalItemsSold" },
          f_upsellRevenue: { $sum: "$food.upsellRevenue" },
          f_upsellOrders: { $sum: "$food.upsellOrders" },
          f_rejectedOrders: { $sum: "$food.rejectedOrders" },
          f_sumTimeToServeMinutes: { $sum: "$food.sumTimeToServeMinutes" },
          f_countServedOrders: { $sum: "$food.countServedOrders" },
          f_sumTimeToAcceptMinutes: { $sum: "$food.sumTimeToAcceptMinutes" },
          f_countAcceptedOrders: { $sum: "$food.countAcceptedOrders" },
          f_PENDING: { $sum: "$food.ordersByStatus.PENDING" },
          f_PREPARING: { $sum: "$food.ordersByStatus.PREPARING" },
          f_SERVED: { $sum: "$food.ordersByStatus.SERVED" },
          f_REJECTED: { $sum: "$food.ordersByStatus.REJECTED" },
          f_CANCELLED: { $sum: "$food.ordersByStatus.CANCELLED" },
          s_totalRequests: { $sum: "$service.totalRequests" },
          s_completedRequests: { $sum: "$service.completedRequests" },
          s_cancelledRequests: { $sum: "$service.cancelledRequests" },
          s_paidRevenue: { $sum: "$service.paidRevenue" },
          o_totalRevenue: { $sum: "$overall.totalRevenue" },
          o_totalTransactions: { $sum: "$overall.totalTransactions" },
          o_totalUpsellRevenue: { $sum: "$overall.totalUpsellRevenue" },
          o_upsellTransactions: { $sum: "$overall.upsellTransactions" },
        },
      },
      {
        $project: {
          _id: 0,
          food: {
            totalOrders: "$f_totalOrders",
            guestOrders: "$f_guestOrders",
            staffOrders: "$f_staffOrders",
            totalRevenue: "$f_totalRevenue",
            totalItemsSold: "$f_totalItemsSold",
            upsellRevenue: "$f_upsellRevenue",
            upsellOrders: "$f_upsellOrders",
            rejectedOrders: "$f_rejectedOrders",
            sumTimeToServeMinutes: "$f_sumTimeToServeMinutes",
            countServedOrders: "$f_countServedOrders",
            sumTimeToAcceptMinutes: "$f_sumTimeToAcceptMinutes",
            countAcceptedOrders: "$f_countAcceptedOrders",
            ordersByStatus: {
              PENDING: "$f_PENDING",
              PREPARING: "$f_PREPARING",
              SERVED: "$f_SERVED",
              REJECTED: "$f_REJECTED",
              CANCELLED: "$f_CANCELLED",
            },
          },
          service: {
            totalRequests: "$s_totalRequests",
            completedRequests: "$s_completedRequests",
            cancelledRequests: "$s_cancelledRequests",
            paidRevenue: "$s_paidRevenue",
          },
          overall: {
            totalRevenue: "$o_totalRevenue",
            totalTransactions: "$o_totalTransactions",
            totalUpsellRevenue: "$o_totalUpsellRevenue",
            upsellTransactions: "$o_upsellTransactions",
          },
        },
      },
    ];
    const [current] = await HotelDailyStats.aggregate(pipeline as unknown as PipelineStage[]);
    const currentSummary = normalizeDocToSummary(current ?? null);
    let previous: AnalyticsSummary | undefined;
    if (compareWithPrevious) {
      const prev = getPreviousRange(from, to);
      const [prevDoc] = await HotelDailyStats.aggregate([
        { $match: { hotelId, date: { $gte: prev.from, $lte: prev.to } } },
        ...(pipeline.slice(1) as unknown as PipelineStage[]),
      ]);
      previous = normalizeDocToSummary(prevDoc ?? null);
    }
    return { current: currentSummary, previous };
  },

  getHotelRevenueTimeseries: async (
    hotelId: string,
    from: string,
    to: string,
    groupBy: string
  ): Promise<RevenueDataPoint[]> => {
    if (groupBy === "hour") {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const days = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000) + 1;
      if (days > GROUPBY_MAX_DAYS_HOUR) {
        const docs = await HotelDailyStats.find({ hotelId, date: { $gte: from, $lte: to } })
          .sort({ date: 1 })
          .lean();
        return docs.map((d) => ({
          period: d.date,
          revenue: (d.overall?.totalRevenue ?? 0) + (d.service?.paidRevenue ?? 0),
          foodRevenue: d.food?.totalRevenue ?? 0,
          serviceRevenue: d.service?.paidRevenue ?? 0,
          upsellRevenue: d.food?.upsellRevenue ?? 0,
          upsellOrders: d.food?.upsellOrders ?? 0,
        }));
      }
      const hourly = await HotelHourlyStats.find({ hotelId, date: { $gte: from, $lte: to } })
        .sort({ date: 1, hour: 1 })
        .lean();
      return hourly.map((h) => ({
        period: `${h.date}T${String(h.hour).padStart(2, "0")}:00:00Z`,
        revenue: (h.overall?.totalRevenue ?? 0) + (h.service?.paidRevenue ?? 0),
        foodRevenue: h.food?.guestRevenue ?? 0,
        serviceRevenue: h.service?.paidRevenue ?? 0,
        upsellRevenue: h.overall?.upsellRevenue ?? 0,
        upsellOrders: h.food?.upsellOrders ?? 0,
      }));
    }
    const groupId = groupBy === "month" ? { $substr: ["$date", 0, 7] } : "$date";
    const pipeline: Record<string, unknown>[] = [
      { $match: { hotelId, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: groupId,
          revenue: { $sum: { $add: ["$overall.totalRevenue", "$service.paidRevenue"] } },
          foodRevenue: { $sum: "$food.totalRevenue" },
          serviceRevenue: { $sum: "$service.paidRevenue" },
          upsellRevenue: { $sum: "$food.upsellRevenue" },
          upsellOrders: { $sum: "$food.upsellOrders" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          period: "$_id",
          revenue: 1,
          foodRevenue: 1,
          serviceRevenue: 1,
          upsellRevenue: 1,
          upsellOrders: 1,
          _id: 0,
        },
      },
    ];
    if (groupBy === "week") {
      const docs = await HotelDailyStats.find({ hotelId, date: { $gte: from, $lte: to } }).lean();
      const byWeek: Record<string, { revenue: number; foodRevenue: number; serviceRevenue: number; upsellRevenue: number; upsellOrders: number }> = {};
      for (const d of docs) {
        const w = weekStart(d.date);
        if (!byWeek[w]) byWeek[w] = { revenue: 0, foodRevenue: 0, serviceRevenue: 0, upsellRevenue: 0, upsellOrders: 0 };
        byWeek[w].revenue += (d.overall?.totalRevenue ?? 0) + (d.service?.paidRevenue ?? 0);
        byWeek[w].foodRevenue += d.food?.totalRevenue ?? 0;
        byWeek[w].serviceRevenue += d.service?.paidRevenue ?? 0;
        byWeek[w].upsellRevenue += d.food?.upsellRevenue ?? 0;
        byWeek[w].upsellOrders += d.food?.upsellOrders ?? 0;
      }
      return Object.entries(byWeek)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, v]) => ({ period, ...v }));
    }
    const result = await HotelDailyStats.aggregate(pipeline as unknown as PipelineStage[]);
    return result as RevenueDataPoint[];
  },

  getHotelOrdersTimeseries: async (
    hotelId: string,
    from: string,
    to: string,
    groupBy: string
  ): Promise<OrdersDataPoint[]> => {
    if (groupBy === "hour") {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const days = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000) + 1;
      if (days > GROUPBY_MAX_DAYS_HOUR) {
        const docs = await HotelDailyStats.find({ hotelId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean();
        return docs.map((d) => ({
          period: d.date,
          foodOrders: d.food?.totalOrders ?? 0,
          serviceOrders: d.service?.totalRequests ?? 0,
        }));
      }
      const hourly = await HotelHourlyStats.find({ hotelId, date: { $gte: from, $lte: to } }).sort({ date: 1, hour: 1 }).lean();
      return hourly.map((h) => ({
        period: `${h.date}T${String(h.hour).padStart(2, "0")}:00:00Z`,
        foodOrders: h.food?.totalOrders ?? 0,
        serviceOrders: h.service?.totalRequests ?? 0,
      }));
    }
    const groupId = groupBy === "month" ? { $substr: ["$date", 0, 7] } : "$date";
    const pipeline: Record<string, unknown>[] = [
      { $match: { hotelId, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: groupId,
          foodOrders: { $sum: "$food.totalOrders" },
          serviceOrders: { $sum: "$service.totalRequests" },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { period: "$_id", foodOrders: 1, serviceOrders: 1, _id: 0 } },
    ];
    if (groupBy === "week") {
      const docs = await HotelDailyStats.find({ hotelId, date: { $gte: from, $lte: to } }).lean();
      const byWeek: Record<string, { foodOrders: number; serviceOrders: number }> = {};
      for (const d of docs) {
        const w = weekStart(d.date);
        if (!byWeek[w]) byWeek[w] = { foodOrders: 0, serviceOrders: 0 };
        byWeek[w].foodOrders += d.food?.totalOrders ?? 0;
        byWeek[w].serviceOrders += d.service?.totalRequests ?? 0;
      }
      return Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => ({ period, ...v }));
    }
    const result = await HotelDailyStats.aggregate(pipeline as unknown as PipelineStage[]);
    return result as OrdersDataPoint[];
  },

  getHotelOrdersByStatus: async (hotelId: string, from: string, to: string): Promise<OrdersByStatus> => {
    const [doc] = await HotelDailyStats.aggregate([
      { $match: { hotelId, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          PENDING: { $sum: "$food.ordersByStatus.PENDING" },
          PREPARING: { $sum: "$food.ordersByStatus.PREPARING" },
          SERVED: { $sum: "$food.ordersByStatus.SERVED" },
          REJECTED: { $sum: "$food.ordersByStatus.REJECTED" },
          CANCELLED: { $sum: "$food.ordersByStatus.CANCELLED" },
        },
      },
      { $project: { _id: 0 } },
    ] as PipelineStage[]);
    const counts = {
      PENDING: (doc?.PENDING as number) ?? 0,
      PREPARING: (doc?.PREPARING as number) ?? 0,
      SERVED: (doc?.SERVED as number) ?? 0,
      REJECTED: (doc?.REJECTED as number) ?? 0,
      CANCELLED: (doc?.CANCELLED as number) ?? 0,
    };
    const total = counts.PENDING + counts.PREPARING + counts.SERVED + counts.REJECTED + counts.CANCELLED;
    const _percentages: Record<string, number> = {};
    if (total > 0) {
      (Object.keys(counts) as (keyof OrdersByStatus)[]).forEach((k) => {
        if (k !== "_percentages") _percentages[k] = Math.round((counts[k] / total) * 10000) / 100;
      });
    }
    return { ...counts, _percentages };
  },

  getHotelOperational: async (hotelId: string, from: string, to: string): Promise<OperationalMetrics> => {
    const summary = await analyticsService.getHotelSummary(hotelId, from, to, false);
    const f = summary.current.food;
    const o = summary.current.overall;
    const totalOrders = f.totalOrders || 1;
    const accepted = (f.ordersByStatus?.PREPARING ?? 0) + (f.ordersByStatus?.SERVED ?? 0);
    const rejected = f.rejectedOrders ?? 0;
    return {
      acceptanceRate: accepted + rejected > 0 ? (accepted / (accepted + rejected)) * 100 : 0,
      rejectionRate: f.rejectionRate ?? 0,
      avgTimeToAcceptMinutes: f.avgTimeToAcceptMinutes ?? 0,
      avgTimeToServeMinutes: f.avgTimeToServeMinutes ?? 0,
      peakHour: f.peakHour ?? 0,
      lowestHour: f.lowestHour ?? 0,
      upsellConversionRate: f.upsellConversionRate ?? 0,
      upsellRevenue: f.upsellRevenue ?? 0,
      upsellContributionRate: o.upsellContributionRate ?? 0,
    };
  },

  getChainSummary: async (
    chainId: string,
    from: string,
    to: string,
    compareWithPrevious = false
  ): Promise<SummaryResponse> => {
    const match = { chainId, date: { $gte: from, $lte: to } };
    const pipeline: Record<string, unknown>[] = [
      { $match: match },
      {
        $group: {
          _id: null,
          f_totalOrders: { $sum: "$food.totalOrders" },
          f_guestOrders: { $sum: "$food.guestOrders" },
          f_staffOrders: { $sum: "$food.staffOrders" },
          f_totalRevenue: { $sum: "$food.totalRevenue" },
          f_totalItemsSold: { $sum: "$food.totalItemsSold" },
          f_upsellRevenue: { $sum: "$food.upsellRevenue" },
          f_upsellOrders: { $sum: "$food.upsellOrders" },
          f_rejectedOrders: { $sum: "$food.rejectedOrders" },
          f_sumTimeToServeMinutes: { $sum: "$food.sumTimeToServeMinutes" },
          f_countServedOrders: { $sum: "$food.countServedOrders" },
          f_sumTimeToAcceptMinutes: { $sum: "$food.sumTimeToAcceptMinutes" },
          f_countAcceptedOrders: { $sum: "$food.countAcceptedOrders" },
          f_PENDING: { $sum: "$food.ordersByStatus.PENDING" },
          f_PREPARING: { $sum: "$food.ordersByStatus.PREPARING" },
          f_SERVED: { $sum: "$food.ordersByStatus.SERVED" },
          f_REJECTED: { $sum: "$food.ordersByStatus.REJECTED" },
          f_CANCELLED: { $sum: "$food.ordersByStatus.CANCELLED" },
          s_totalRequests: { $sum: "$service.totalRequests" },
          s_completedRequests: { $sum: "$service.completedRequests" },
          s_cancelledRequests: { $sum: "$service.cancelledRequests" },
          s_paidRevenue: { $sum: "$service.paidRevenue" },
          o_totalRevenue: { $sum: "$overall.totalRevenue" },
          o_totalTransactions: { $sum: "$overall.totalTransactions" },
          o_totalUpsellRevenue: { $sum: "$overall.totalUpsellRevenue" },
          o_upsellTransactions: { $sum: "$overall.upsellTransactions" },
          h_activeHotelCount: { $max: "$hotels.activeHotelCount" },
          h_totalRoomNights: { $sum: "$hotels.totalRoomNights" },
        },
      },
      {
        $project: {
          _id: 0,
          food: {
            totalOrders: "$f_totalOrders",
            guestOrders: "$f_guestOrders",
            staffOrders: "$f_staffOrders",
            totalRevenue: "$f_totalRevenue",
            totalItemsSold: "$f_totalItemsSold",
            upsellRevenue: "$f_upsellRevenue",
            upsellOrders: "$f_upsellOrders",
            rejectedOrders: "$f_rejectedOrders",
            sumTimeToServeMinutes: "$f_sumTimeToServeMinutes",
            countServedOrders: "$f_countServedOrders",
            sumTimeToAcceptMinutes: "$f_sumTimeToAcceptMinutes",
            countAcceptedOrders: "$f_countAcceptedOrders",
            ordersByStatus: {
              PENDING: "$f_PENDING",
              PREPARING: "$f_PREPARING",
              SERVED: "$f_SERVED",
              REJECTED: "$f_REJECTED",
              CANCELLED: "$f_CANCELLED",
            },
          },
          service: {
            totalRequests: "$s_totalRequests",
            completedRequests: "$s_completedRequests",
            cancelledRequests: "$s_cancelledRequests",
            paidRevenue: "$s_paidRevenue",
          },
          overall: {
            totalRevenue: "$o_totalRevenue",
            totalTransactions: "$o_totalTransactions",
            totalUpsellRevenue: "$o_totalUpsellRevenue",
            upsellTransactions: "$o_upsellTransactions",
          },
          hotels: {
            activeHotelCount: "$h_activeHotelCount",
            totalRoomNights: "$h_totalRoomNights",
          },
        },
      },
    ];
    const [current] = await ChainDailyStats.aggregate(pipeline as unknown as PipelineStage[]);
    const currentSummary = normalizeDocToSummary(current ?? null);
    let previous: AnalyticsSummary | undefined;
    if (compareWithPrevious) {
      const prev = getPreviousRange(from, to);
      const [prevDoc] = await ChainDailyStats.aggregate([
        { $match: { chainId, date: { $gte: prev.from, $lte: prev.to } } },
        ...(pipeline.slice(1) as unknown as PipelineStage[]),
      ]);
      previous = normalizeDocToSummary(prevDoc ?? null);
    }
    const response: SummaryResponse & { hotels?: { activeHotelCount: number; totalRoomNights: number } } = {
      current: currentSummary,
      previous,
    };
    if (current?.hotels) {
      response.hotels = current.hotels as { activeHotelCount: number; totalRoomNights: number };
    }
    return response;
  },

  getChainRevenueTimeseries: async (
    chainId: string,
    from: string,
    to: string,
    groupBy: string
  ): Promise<RevenueDataPoint[]> => {
    const groupId = groupBy === "month" ? { $substr: ["$date", 0, 7] } : "$date";
    const pipeline: Record<string, unknown>[] = [
      { $match: { chainId, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: groupId,
          revenue: { $sum: { $add: ["$overall.totalRevenue", "$service.paidRevenue"] } },
          foodRevenue: { $sum: "$food.totalRevenue" },
          serviceRevenue: { $sum: "$service.paidRevenue" },
          upsellRevenue: { $sum: "$food.upsellRevenue" },
          upsellOrders: { $sum: "$food.upsellOrders" },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { period: "$_id", revenue: 1, foodRevenue: 1, serviceRevenue: 1, upsellRevenue: 1, upsellOrders: 1, _id: 0 } },
    ];
    if (groupBy === "week") {
      const docs = await ChainDailyStats.find({ chainId, date: { $gte: from, $lte: to } }).lean();
      const byWeek: Record<string, { revenue: number; foodRevenue: number; serviceRevenue: number; upsellRevenue: number; upsellOrders: number }> = {};
      for (const d of docs) {
        const w = weekStart(d.date);
        if (!byWeek[w]) byWeek[w] = { revenue: 0, foodRevenue: 0, serviceRevenue: 0, upsellRevenue: 0, upsellOrders: 0 };
        byWeek[w].revenue += (d.overall?.totalRevenue ?? 0) + (d.service?.paidRevenue ?? 0);
        byWeek[w].foodRevenue += d.food?.totalRevenue ?? 0;
        byWeek[w].serviceRevenue += d.service?.paidRevenue ?? 0;
        byWeek[w].upsellRevenue += d.food?.upsellRevenue ?? 0;
        byWeek[w].upsellOrders += d.food?.upsellOrders ?? 0;
      }
      return Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => ({ period, ...v }));
    }
    const result = await ChainDailyStats.aggregate(pipeline as unknown as PipelineStage[]);
    return result as RevenueDataPoint[];
  },

  getChainOrdersTimeseries: async (
    chainId: string,
    from: string,
    to: string,
    groupBy: string
  ): Promise<OrdersDataPoint[]> => {
    const groupId = groupBy === "month" ? { $substr: ["$date", 0, 7] } : "$date";
    const pipeline: Record<string, unknown>[] = [
      { $match: { chainId, date: { $gte: from, $lte: to } } },
      { $group: { _id: groupId, foodOrders: { $sum: "$food.totalOrders" }, serviceOrders: { $sum: "$service.totalRequests" } } },
      { $sort: { _id: 1 } },
      { $project: { period: "$_id", foodOrders: 1, serviceOrders: 1, _id: 0 } },
    ];
    if (groupBy === "week") {
      const docs = await ChainDailyStats.find({ chainId, date: { $gte: from, $lte: to } }).lean();
      const byWeek: Record<string, { foodOrders: number; serviceOrders: number }> = {};
      for (const d of docs) {
        const w = weekStart(d.date);
        if (!byWeek[w]) byWeek[w] = { foodOrders: 0, serviceOrders: 0 };
        byWeek[w].foodOrders += d.food?.totalOrders ?? 0;
        byWeek[w].serviceOrders += d.service?.totalRequests ?? 0;
      }
      return Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => ({ period, ...v }));
    }
    const result = await ChainDailyStats.aggregate(pipeline as unknown as PipelineStage[]);
    return result as OrdersDataPoint[];
  },

  getChainOrdersByStatus: async (chainId: string, from: string, to: string): Promise<OrdersByStatus> => {
    const [doc] = await ChainDailyStats.aggregate([
      { $match: { chainId, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          PENDING: { $sum: "$food.ordersByStatus.PENDING" },
          PREPARING: { $sum: "$food.ordersByStatus.PREPARING" },
          SERVED: { $sum: "$food.ordersByStatus.SERVED" },
          REJECTED: { $sum: "$food.ordersByStatus.REJECTED" },
          CANCELLED: { $sum: "$food.ordersByStatus.CANCELLED" },
        },
      },
      { $project: { _id: 0 } },
    ]);
    const counts = {
      PENDING: (doc?.PENDING as number) ?? 0,
      PREPARING: (doc?.PREPARING as number) ?? 0,
      SERVED: (doc?.SERVED as number) ?? 0,
      REJECTED: (doc?.REJECTED as number) ?? 0,
      CANCELLED: (doc?.CANCELLED as number) ?? 0,
    };
    const total = counts.PENDING + counts.PREPARING + counts.SERVED + counts.REJECTED + counts.CANCELLED;
    const _percentages: Record<string, number> = {};
    if (total > 0) {
      (Object.keys(counts) as (keyof OrdersByStatus)[]).forEach((k) => {
        if (k !== "_percentages") _percentages[k] = Math.round((counts[k] / total) * 10000) / 100;
      });
    }
    return { ...counts, _percentages };
  },

  getChainOperational: async (chainId: string, from: string, to: string): Promise<OperationalMetrics> => {
    const summary = await analyticsService.getChainSummary(chainId, from, to, false);
    const f = summary.current.food;
    const o = summary.current.overall;
    const accepted = (f.ordersByStatus?.PREPARING ?? 0) + (f.ordersByStatus?.SERVED ?? 0);
    const rejected = f.rejectedOrders ?? 0;
    return {
      acceptanceRate: accepted + rejected > 0 ? (accepted / (accepted + rejected)) * 100 : 0,
      rejectionRate: f.rejectionRate ?? 0,
      avgTimeToAcceptMinutes: f.avgTimeToAcceptMinutes ?? 0,
      avgTimeToServeMinutes: f.avgTimeToServeMinutes ?? 0,
      peakHour: f.peakHour ?? 0,
      lowestHour: f.lowestHour ?? 0,
      upsellConversionRate: f.upsellConversionRate ?? 0,
      upsellRevenue: f.upsellRevenue ?? 0,
      upsellContributionRate: o.upsellContributionRate ?? 0,
    };
  },

  getChainHotelsRanking: async (
    chainId: string,
    from: string,
    to: string,
    limit: number,
    sortBy: "revenue" | "orders"
  ): Promise<HotelRankingItem[]> => {
    const pipeline: Record<string, unknown>[] = [
      { $match: { chainId, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$hotelId",
          revenue: { $sum: { $add: ["$overall.totalRevenue", "$service.paidRevenue"] } },
          foodRevenue: { $sum: "$food.totalRevenue" },
          serviceRevenue: { $sum: "$service.paidRevenue" },
          upsellRevenue: { $sum: "$food.upsellRevenue" },
          foodOrders: { $sum: "$food.totalOrders" },
          serviceOrders: { $sum: "$service.totalRequests" },
        },
      },
      { $sort: sortBy === "revenue" ? { revenue: -1 } : { foodOrders: -1 } },
      { $limit: limit },
      { $project: { hotelId: "$_id", revenue: 1, foodRevenue: 1, serviceRevenue: 1, upsellRevenue: 1, foodOrders: 1, serviceOrders: 1, _id: 0 } },
    ];
    const result = await HotelDailyStats.aggregate(pipeline as unknown as PipelineStage[]);
    return result as HotelRankingItem[];
  },
};
