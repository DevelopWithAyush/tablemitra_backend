import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const AnalyticsDateRangeSchema = z.object({
  query: z.object({
    from: dateStr,
    to: dateStr,
    groupBy: z.enum(["day", "week", "month", "hour"]).optional().default("day"),
  }),
}).refine((data) => data.query.from <= data.query.to, {
  message: "from must be before or equal to to",
  path: ["query"],
});

export const AnalyticsSummarySchema = z.object({
  query: z.object({
    from: dateStr,
    to: dateStr,
    compareWith: z.enum(["previous_period"]).optional(),
  }),
}).refine((data) => data.query.from <= data.query.to, {
  message: "from must be before or equal to to",
  path: ["query"],
});

export const ChainHotelsRankingSchema = z.object({
  query: z.object({
    from: dateStr,
    to: dateStr,
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z.enum(["revenue", "orders"]).optional().default("revenue"),
  }),
}).refine((data) => data.query.from <= data.query.to, {
  message: "from must be before or equal to to",
  path: ["query"],
});

export type AnalyticsDateRangeQuery = z.infer<typeof AnalyticsDateRangeSchema>["query"];
export type AnalyticsSummaryQuery = z.infer<typeof AnalyticsSummarySchema>["query"];
export type ChainHotelsRankingQuery = z.infer<typeof ChainHotelsRankingSchema>["query"];
