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
     * food order and service request scoped to the customer's current hotel
     * (from the customer_room_hotel_id cookie).
     *
     * Returns empty arrays when no hotel cookie is present — the customer has
     * not checked in, so they cannot have active orders at any hotel.
     */
    getActiveSummary = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const hotelId = req.cookies?.customer_room_hotel_id as string | undefined;

        if (!hotelId) {
            return res.status(200).json({
                success: true,
                data: { foodOrders: [], serviceRequests: [] },
            });
        }

        const [foodOrders, serviceRequests] = await Promise.all([
            foodOrderService.getActiveFoodOrdersSummary(user.sub, hotelId),
            serviceRequestService.getActiveServiceRequestsSummary(user.sub, hotelId),
        ]);

        res.status(200).json({
            success: true,
            data: { foodOrders, serviceRequests },
        });
    });

    /**
     * GET /orders/food/active
     *
     * Full active food orders for the food-order status page carousel.
     * Scoped to the customer's current hotel (customer_room_hotel_id cookie).
     * Returns empty array when no hotel cookie is present.
     */
    getActiveFoodOrders = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const hotelId = req.cookies?.customer_room_hotel_id as string | undefined;

        if (!hotelId) {
            return res.status(200).json({ success: true, data: [] });
        }

        const orders = await foodOrderService.getActiveFoodOrders(user.sub, hotelId);

        res.status(200).json({ success: true, data: orders });
    });

    /**
     * GET /orders/service/active
     *
     * Full active service requests for the service-request status page carousel.
     * Scoped to the customer's current hotel (customer_room_hotel_id cookie).
     * Returns empty array when no hotel cookie is present.
     */
    getActiveServiceRequests = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const hotelId = req.cookies?.customer_room_hotel_id as string | undefined;

        if (!hotelId) {
            return res.status(200).json({ success: true, data: [] });
        }

        const requests = await serviceRequestService.getActiveServiceRequests(user.sub, hotelId);

        res.status(200).json({ success: true, data: requests });
    });
}
