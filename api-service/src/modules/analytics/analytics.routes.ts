import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { AnalyticsController } from "./analytics.controller.js";
import {
  AnalyticsDateRangeSchema,
  AnalyticsSummarySchema,
  ChainHotelsRankingSchema,
} from "./analytics.validator.js";

const controller = new AnalyticsController();
const analyticsRoutes = Router({ mergeParams: true });

analyticsRoutes.use(authMiddleware);

// ------------------------- Hotel (manager) – VIEW_HOTEL_REPORTS -------------------------
analyticsRoutes.get(
  "/hotel/summary",
  requirePermissions(["VIEW_HOTEL_REPORTS"], "any", true),
  validate(AnalyticsSummarySchema),
  controller.getHotelSummary
);
analyticsRoutes.get(
  "/hotel/revenue-timeseries",
  requirePermissions(["VIEW_HOTEL_REPORTS"], "any", true),
  validate(AnalyticsDateRangeSchema),
  controller.getHotelRevenueTimeseries
);
analyticsRoutes.get(
  "/hotel/orders-timeseries",
  requirePermissions(["VIEW_HOTEL_REPORTS"], "any", true),
  validate(AnalyticsDateRangeSchema),
  controller.getHotelOrdersTimeseries
);
analyticsRoutes.get(
  "/hotel/orders-by-status",
  requirePermissions(["VIEW_HOTEL_REPORTS"], "any", true),
  validate(AnalyticsSummarySchema),
  controller.getHotelOrdersByStatus
);
analyticsRoutes.get(
  "/hotel/operational",
  requirePermissions(["VIEW_HOTEL_REPORTS"], "any", true),
  validate(AnalyticsSummarySchema),
  controller.getHotelOperational
);

// ------------------------- Chain (founder) – VIEW_CHAIN_REPORTS -------------------------
analyticsRoutes.get(
  "/chain/summary",
  requirePermissions(["VIEW_CHAIN_REPORTS"], "any", true),
  validate(AnalyticsSummarySchema),
  controller.getChainSummary
);
analyticsRoutes.get(
  "/chain/revenue-timeseries",
  requirePermissions(["VIEW_CHAIN_REPORTS"], "any", true),
  validate(AnalyticsDateRangeSchema),
  controller.getChainRevenueTimeseries
);
analyticsRoutes.get(
  "/chain/orders-timeseries",
  requirePermissions(["VIEW_CHAIN_REPORTS"], "any", true),
  validate(AnalyticsDateRangeSchema),
  controller.getChainOrdersTimeseries
);
analyticsRoutes.get(
  "/chain/orders-by-status",
  requirePermissions(["VIEW_CHAIN_REPORTS"], "any", true),
  validate(AnalyticsSummarySchema),
  controller.getChainOrdersByStatus
);
analyticsRoutes.get(
  "/chain/operational",
  requirePermissions(["VIEW_CHAIN_REPORTS"], "any", true),
  validate(AnalyticsSummarySchema),
  controller.getChainOperational
);
analyticsRoutes.get(
  "/chain/hotels-ranking",
  requirePermissions(["VIEW_CHAIN_REPORTS"], "any", true),
  validate(ChainHotelsRankingSchema),
  controller.getChainHotelsRanking
);

export default analyticsRoutes;
