import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { IJwtPayload } from "../auth/auth.types.js";
import { foodOrderService } from "./food-order.service.js";
import { serviceRequestService } from "./service-request.service.js";

export class ActiveOrdersController {
    /**
     * GET /orders/active
     *
     * Bottom-bar summary. Returns only _id + status + createdAt for each active
     * food order and service request belonging to the caller.
     *
     * Lightweight by design — the frontend uses this to render the bottom bar
     * count and per-order status animation without fetching item details.
     * Real-time updates arrive via socket events (food.order.preparing,
     * service.request.accepted, etc.) so no polling is needed after initial load.
     */
    getActiveSummary = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;

        const [foodOrders, serviceRequests] = await Promise.all([
            foodOrderService.getActiveFoodOrdersSummary(user.sub),
            serviceRequestService.getActiveServiceRequestsSummary(user.sub),
        ]);

        res.status(200).json({
            success: true,
            data: { foodOrders, serviceRequests },
        });
    });

    /**
     * GET /orders/food/active
     *
     * Full active food orders for the food-order status page.
     * Returns item list, bill, hotel name and timestamps so the carousel
     * can render per-order progress animations (PENDING → PREPARING).
     * Sorted oldest-first — the first order placed appears first in the carousel.
     */
    getActiveFoodOrders = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;

        const orders = await foodOrderService.getActiveFoodOrders(user.sub);

        res.status(200).json({
            success: true,
            data: orders,
        });
    });

    /**
     * GET /orders/service/active
     *
     * Full active service requests for the service-request status page.
     * Returns item list (grouped by category), hotel name and timestamps so
     * the carousel can render per-request progress animations
     * (PENDING → ACCEPTED → IN_PROGRESS).
     * Sorted oldest-first — the earliest request appears first in the carousel.
     */
    getActiveServiceRequests = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;

        const requests = await serviceRequestService.getActiveServiceRequests(user.sub);

        res.status(200).json({
            success: true,
            data: requests,
        });
    });
}
