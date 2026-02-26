import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { ErrorHandler } from "../../middleware/error.middleware.js";
import { IJwtPayload } from "../auth/auth.types.js";
import { analyticsService } from "./analytics.service.js";

function getHotelId(req: Request): string {
  const user = (req as any).user as IJwtPayload;
  if (user.ctx?.type !== "HOTEL" || !user.ctx?.id) {
    throw new ErrorHandler("Forbidden: hotel context required", 403);
  }
  return user.ctx.id;
}

function getChainId(req: Request): string {
  const user = (req as any).user as IJwtPayload;
  if (user.ctx?.type !== "CHAIN" || !user.ctx?.id) {
    throw new ErrorHandler("Forbidden: chain context required", 403);
  }
  return user.ctx.id;
}

export class AnalyticsController {
  getHotelSummary = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelId(req);
    const { from, to, compareWith } = req.query as { from: string; to: string; compareWith?: string };
    const data = await analyticsService.getHotelSummary(
      hotelId,
      from,
      to,
      compareWith === "previous_period"
    );
    res.status(200).json({ success: true, data });
  });

  getHotelRevenueTimeseries = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelId(req);
    const { from, to, groupBy } = req.query as { from: string; to: string; groupBy?: string };
    const data = await analyticsService.getHotelRevenueTimeseries(
      hotelId,
      from,
      to,
      groupBy ?? "day"
    );
    res.status(200).json({ success: true, data });
  });

  getHotelOrdersTimeseries = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelId(req);
    const { from, to, groupBy } = req.query as { from: string; to: string; groupBy?: string };
    const data = await analyticsService.getHotelOrdersTimeseries(
      hotelId,
      from,
      to,
      groupBy ?? "day"
    );
    res.status(200).json({ success: true, data });
  });

  getHotelOrdersByStatus = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelId(req);
    const { from, to } = req.query as { from: string; to: string };
    const data = await analyticsService.getHotelOrdersByStatus(hotelId, from, to);
    res.status(200).json({ success: true, data });
  });

  getHotelOperational = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelId(req);
    const { from, to } = req.query as { from: string; to: string };
    const data = await analyticsService.getHotelOperational(hotelId, from, to);
    res.status(200).json({ success: true, data });
  });

  getChainSummary = asyncHandler(async (req: Request, res: Response) => {
    const chainId = getChainId(req);
    const { from, to, compareWith } = req.query as { from: string; to: string; compareWith?: string };
    const data = await analyticsService.getChainSummary(
      chainId,
      from,
      to,
      compareWith === "previous_period"
    );
    res.status(200).json({ success: true, data });
  });

  getChainRevenueTimeseries = asyncHandler(async (req: Request, res: Response) => {
    const chainId = getChainId(req);
    const { from, to, groupBy } = req.query as { from: string; to: string; groupBy?: string };
    const data = await analyticsService.getChainRevenueTimeseries(
      chainId,
      from,
      to,
      groupBy ?? "day"
    );
    res.status(200).json({ success: true, data });
  });

  getChainOrdersTimeseries = asyncHandler(async (req: Request, res: Response) => {
    const chainId = getChainId(req);
    const { from, to, groupBy } = req.query as { from: string; to: string; groupBy?: string };
    const data = await analyticsService.getChainOrdersTimeseries(
      chainId,
      from,
      to,
      groupBy ?? "day"
    );
    res.status(200).json({ success: true, data });
  });

  getChainOrdersByStatus = asyncHandler(async (req: Request, res: Response) => {
    const chainId = getChainId(req);
    const { from, to } = req.query as { from: string; to: string };
    const data = await analyticsService.getChainOrdersByStatus(chainId, from, to);
    res.status(200).json({ success: true, data });
  });

  getChainOperational = asyncHandler(async (req: Request, res: Response) => {
    const chainId = getChainId(req);
    const { from, to } = req.query as { from: string; to: string };
    const data = await analyticsService.getChainOperational(chainId, from, to);
    res.status(200).json({ success: true, data });
  });

  getChainHotelsRanking = asyncHandler(async (req: Request, res: Response) => {
    const chainId = getChainId(req);
    const { from, to, limit, sortBy } = req.query as {
      from: string;
      to: string;
      limit?: string;
      sortBy?: "revenue" | "orders";
    };
    const data = await analyticsService.getChainHotelsRanking(
      chainId,
      from,
      to,
      parseInt(limit ?? "20", 10),
      sortBy ?? "revenue"
    );
    res.status(200).json({ success: true, data });
  });
}
