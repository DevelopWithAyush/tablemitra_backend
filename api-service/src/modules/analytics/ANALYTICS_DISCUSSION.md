# Analytics APIs – Manager & Founder Panels

## Architecture recap

- **Analytics worker** (analytics-service): consumes order/service events from RabbitMQ and writes **replica aggregates** into MongoDB (HotelHourlyStats, HotelDailyStats, ChainDailyStats). No user traffic; API service stays fast for orders.
- **API service**: will expose **read-only** analytics endpoints that query the **same collections** (same DB). Same schema, so responses match what the worker writes.

---

## Data we already have (from analytics worker)

### Hotel-level (manager panel)

| Source | Granularity | Key fields |
|--------|-------------|------------|
| **HotelDailyStats** | per day | `food`: totalOrders, guestOrders, staffOrders, totalRevenue, totalItemsSold, upsellRevenue, upsellOrders, averageOrderValue, upsellConversionRate, rejectedOrders, rejectionRate, acceptanceRate, avgTimeToAcceptMinutes, avgTimeToServeMinutes, avgTimeToCompleteMinutes, peakHour, lowestHour. `service`: totalRequests, completedRequests, cancelledRequests, cancellationRate, paidRevenue, averageServiceValue, avgCompletionTimeMinutes. `overall`: totalRevenue, totalTransactions, totalUpsellRevenue, upsellTransactions, averageTransactionValue, upsellContributionRate. `occupancy`: roomsCheckedIn, roomsCheckedOut, roomNights, occupancyRate. |
| **HotelHourlyStats** | per hour (per day) | Same buckets (food, service, overall) with hourly counts and revenue; guestRevenue, acceptanceRate, avgTimeToAcceptMinutes, avgTimeToServeMinutes. |

### Chain-level (founder panel)

| Source | Granularity | Key fields |
|--------|-------------|------------|
| **ChainDailyStats** | per day | `food`: same as hotel daily. `service`: same. `overall`: same. `hotels`: activeHotelCount, totalRoomNights. |

*Note: Time metrics (avgTimeToServe, rejectionRate, etc.) need status-change events (ORDER_SERVED, ORDER_REJECTED) in the worker; currently only ORDER_CREATED is consumed. We can still expose what we have and add more later.*

---

## What to show on the **manager panel** (hotel)

Aligned with your UI and the schema above:

### 1. KPI cards (top row)

- **Total revenue** – sum of `overall.totalRevenue` (or `food.totalRevenue` + service) for the selected period + **vs previous period** (e.g. % change vs last month).
- **Total orders** – sum of `food.totalOrders` for the period + % vs previous period.
- **Total food orders** – same as above (or keep one “orders” and one “service requests”).
- **Total service orders** – sum of `service.totalRequests` + % vs previous period.
- **Total food revenue** – sum of `food.totalRevenue` for the period + % vs previous period.
- **Total service revenue** – sum of `service.paidRevenue` (or equivalent) + % vs previous period.

All “vs last period” values come from comparing current range to same-length previous range (e.g. this month vs last month, or last 7 days vs previous 7 days).

### 2. Revenue chart (time series)

- **Endpoint**: time-series of revenue by day (or by hour) for a date range.
- **Data**: from HotelDailyStats (and optionally HotelHourlyStats for “by hour”). Return `date` (and `hour` if hourly), `revenue`, optionally `foodRevenue`, `serviceRevenue`.
- **UI**: area/line chart (e.g. “7 Apr – 30 Jun”) with optional anomaly/issue markers if we add them later.

### 3. Status breakdown (food orders)

- **Endpoint**: counts (and optionally %) by order status for the period.
- **Data**: today we don’t have status breakdown in the analytics DB (worker only increments totals). Options:
  - **A)** Add a small aggregation in api-service that reads from **FoodOrder** (main DB) for that hotel and date range and counts by `status` (PENDING, PREPARING, SERVED, REJECTED). Keeps analytics worker unchanged; one read query per request.
  - **B)** Extend the worker to consume ORDER_SERVED / ORDER_REJECTED etc. and write status counts into HotelDailyStats (e.g. `food.ordersByStatus: { PENDING, PREPARING, SERVED, REJECTED }`). Then api-service only reads from analytics collections.
- **UI**: pie chart + list with count and “Increased by X%” (current period vs previous period).

### 4. Food orders chart (daily bars)

- **Endpoint**: daily (or hourly) food order counts for a date range.
- **Data**: from HotelDailyStats `food.totalOrders` per day (or HotelHourlyStats per hour).
- **UI**: bar chart (e.g. “1 Apr – 10 Apr”).

### 5. Service orders chart (trend)

- **Endpoint**: daily or monthly service request counts for a date range.
- **Data**: from HotelDailyStats `service.totalRequests` (and completed/cancelled if needed) per day.
- **UI**: line chart (e.g. Jan–Jun by month: aggregate daily into months in API or frontend).

### 6. Extra metrics that help managers (and show SaaS value)

- **Upsell**: total upsell revenue, upsell orders, upsell conversion rate (already in schema). Shows “TableMitra helps you grow add-on revenue.”
- **Rejection / acceptance**: rejection rate, acceptance rate (when populated by worker). Shows kitchen/operational health.
- **Speed**: avg time to accept, avg time to serve (when populated). “Faster service” story.
- **Peak / low hours**: peakHour, lowestHour (hotel daily). For staffing and menu planning.
- **Occupancy** (if worker fills it): room nights, occupancy rate. Connects F&B and service to occupancy.

---

## What to show on the **founder panel** (chain)

Same **concepts** as manager, but:

- **Scope**: chain-level (all hotels in the chain).
- **Data source**: ChainDailyStats only (no hourly for chain in current schema; we could add later if needed).
- **KPIs**: total revenue (chain), total orders, total food orders, total service orders, total food revenue, total service revenue, all with “vs previous period.”
- **Charts**: revenue over time (by day), food orders by day, service orders by day (or month).
- **Extra**: active hotel count, total room nights (from `hotels`), average revenue per hotel, top hotels by revenue (would need aggregation over HotelDailyStats by hotelId for the chain).

---

## API design (same schema, proper permissions)

### Permissions (already in seed)

- **Manager (hotel)**: `VIEW_HOTEL_REPORTS` – required for all hotel-level analytics. Context: `user.ctx.type === "HOTEL"`, `user.ctx.id === hotelId`; only return data for that hotel.
- **Founder (chain)**: `VIEW_CHAIN_REPORTS` – required for all chain-level analytics. Context: `user.ctx.type === "CHAIN"`, `user.ctx.id === chainId`; only return data for that chain.

### Suggested endpoints

**Manager (hotel)** – all require `VIEW_HOTEL_REPORTS` and hotel context (hotelId from JWT ctx or query; enforce ctx.id):

1. `GET /api/v1/{app}/analytics/hotel/summary`  
   Query: `from` (YYYY-MM-DD), `to` (YYYY-MM-DD).  
   Response: aggregated KPIs for the period + same KPIs for previous period so frontend can compute % change (totalRevenue, totalOrders, totalFoodOrders, totalServiceOrders, totalFoodRevenue, totalServiceRevenue, upsellRevenue, etc.).

2. `GET /api/v1/{app}/analytics/hotel/revenue-timeseries`  
   Query: `from`, `to`, `granularity=day|hour`.  
   Response: array of `{ date, hour?, revenue, foodRevenue, serviceRevenue }`.

3. `GET /api/v1/{app}/analytics/hotel/orders-timeseries`  
   Query: `from`, `to`, `granularity=day|hour`.  
   Response: array of `{ date, hour?, foodOrders, serviceOrders }`.

4. `GET /api/v1/{app}/analytics/hotel/orders-by-status`  
   Query: `from`, `to`.  
   Response: counts (and %) by status. Implement via option A (query FoodOrder for this hotel + date range) or B (extend worker and read from stats).

5. (Optional) `GET /api/v1/{app}/analytics/hotel/operational`  
   Query: `from`, `to`.  
   Response: acceptanceRate, rejectionRate, avgTimeToAccept, avgTimeToServe, peakHour, lowestHour, upsellConversionRate (from daily stats aggregates).

**Founder (chain)** – all require `VIEW_CHAIN_REPORTS` and chain context:

1. `GET /api/v1/{app}/analytics/chain/summary`  
   Query: `from`, `to`.  
   Response: same shape as hotel summary but chain-wide (+ activeHotelCount, totalRoomNights).

2. `GET /api/v1/{app}/analytics/chain/revenue-timeseries`  
   Query: `from`, `to`.  
   Response: array of `{ date, revenue, foodRevenue, serviceRevenue }` (daily only for now).

3. `GET /api/v1/{app}/analytics/chain/orders-timeseries`  
   Query: `from`, `to`.  
   Response: array of `{ date, foodOrders, serviceOrders }`.

4. (Optional) `GET /api/v1/{app}/analytics/chain/hotels-ranking`  
   Query: `from`, `to`.  
   Response: list of hotels in the chain with revenue/orders for the period (from HotelDailyStats grouped by hotelId).

All responses use the **same schema** as the analytics models (same field names and structure) so the frontend and any future exports stay consistent.

---

## How this shows “how our SaaS helps them grow”

| Metric / feature | Message to customer |
|------------------|---------------------|
| **Total revenue / orders** | See performance at a glance; compare periods. |
| **Upsell revenue & conversion** | “TableMitra drives add-on sales” (QR upsell, suggestions). |
| **Acceptance / rejection rate** | Operate kitchen and inventory better; reduce waste. |
| **Avg time to serve** | “Faster service” and capacity planning. |
| **Peak / low hours** | Staffing and menu timing. |
| **Food vs service split** | Balance F&B and room service. |
| **Chain view (founder)** | Compare properties; see which hotels drive growth. |
| **Occupancy (when added)** | Link F&B and service revenue to occupancy. |

---

## Implementation notes

1. **DB**: api-service and analytics-service use the same MongoDB and dbName, so analytics collections are in the same database. In api-service, add **read-only** models (same schema) for HotelDailyStats, HotelHourlyStats, ChainDailyStats and query them; no new connection needed.
2. **Period comparison**: For “vs last month” or “vs previous period”, run two aggregations (current range + previous range) and return both in summary so the frontend can compute percentage change.
3. **Status breakdown**: Decide between A (query FoodOrder in api-service for status counts) and B (extend worker and read from stats). A is faster to ship; B keeps all analytics in the replica.
4. **Swagger**: Add `analytics.yml` and document all endpoints with query params and response schemas aligned to the analytics models.
5. **Validator**: Add query validation for `from`, `to` (date format, to >= from), optional `hotelId`/`chainId` (and enforce they match JWT ctx).

Once we lock this spec, the next step is to implement the analytics module in api-service (models, service, controller, routes, permissions, Swagger) and then add status breakdown (and later worker enhancements for time/status) as needed.
