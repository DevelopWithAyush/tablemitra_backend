# Analytics Schemas (Industrial Standard)

Hotel hourly, hotel daily, and chain daily stats support manager dashboards and improvement metrics.

## Revenue and orders

- **Guest vs staff orders**: `guestOrders` / `staffOrders` are separated. **Revenue** (all `*Revenue` and `totalRevenue` fields) includes **only guest and staff-for-guest orders**; staff self-orders are **excluded** from revenue.
- **Upsell**: tracked separately; contribution rate = upsell revenue / total revenue.

## Time metrics (food orders)

- **avgTimeToAcceptMinutes**: from order created to accepted (kitchen accepted).
- **avgTimeToServeMinutes** / **avgTimeToCompleteMinutes**: from order created to served.

To compute these, the **analytics worker** (or source system) needs order-level timestamps:

- `createdAt` (existing via timestamps).
- **Recommended on FoodOrder (api-service)**: `acceptedAt`, `preparingAt`, `servedAt`, `rejectedAt` (set when status changes). Without these, the worker cannot populate time metrics; it can leave them 0 or derive from event stream if status-change events carry timestamps.

## Service request metrics

- Completion time and cancellation rate require service-request status timestamps (e.g. completedAt, cancelledAt) in the source system or event payloads.

## Occupancy (hotel daily)

- Optional. Populated from room-session check-in/check-out events if available; otherwise leave 0.
