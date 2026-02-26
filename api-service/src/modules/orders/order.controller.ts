import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { IJwtPayload } from "../auth/auth.types.js";
import { foodOrderService } from "./order.service.js";
import type { OrderItemInput } from "./order.types.js";
import { SocketDispatcher } from "../../infra/socket/socket.dispatcher.js";
import { SOCKET_EVENTS } from "../../infra/socket/socket.events.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import { publishFoodOrderEvent } from "./order.analytics.publisher.js";

export class OrderController {
    placeOrder = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const app = (req.params.app as string) ?? "";
        const { items, roomNumber, forStaff, cookingRequest } = req.body as {
            items: OrderItemInput[];
            roomNumber?: string;
            forStaff?: boolean;
            cookingRequest?: string;
        };

        const customerRoomHotelId = req.cookies?.customer_room_hotel_id as string | undefined;
        const customerRoomSessionId = req.cookies?.customer_room_session_id as string | undefined;
        const customerRoomNumber = req.cookies?.customer_room_room_number as string | undefined;
        const staffHotelId = user.ctx?.type === "HOTEL" ? user.ctx.id : undefined;

        const order = await foodOrderService.placeOrder({
            userId: user.sub,
            app,
            items,
            roomNumber,
            forStaff,
            cookingRequest,
            customerRoomHotelId,
            customerRoomSessionId,
            customerRoomNumber,
            staffHotelId,
        });

        const orderId = order._id.toString();
        const hotelId = order.hotelId.toString();
        const amount = order.source === "STAFF" ? 0 : (order.bill?.toPay ?? 0);

        const orderItems = (order.items ?? []) as Array<{ isUpsell?: boolean; price: number; discountedPrice?: number; quantity: number }>;
        const upsellRevenue = orderItems
            .filter((i) => i.isUpsell)
            .reduce((sum, i) => sum + ((i.discountedPrice ?? i.price) ?? 0) * (i.quantity ?? 0), 0);
        const totalItemsSold = orderItems.reduce((sum, i) => sum + (i.quantity ?? 0), 0);

        const hotelRes = await hospitalityService.getHotelById(hotelId);
        const rawChain = hotelRes.success && hotelRes.data ? (hotelRes.data as { chainId?: { _id?: unknown } | string }).chainId : undefined;
        const chainId = rawChain ? (typeof rawChain === "object" && rawChain._id ? String(rawChain._id) : String(rawChain)) : undefined;

        publishFoodOrderEvent({
            event: "ORDER_CREATED",
            orderId,
            hotelId,
            chainId,
            source: order.source,
            channelType: order.channelType,
            amount,
            upsellRevenue,
            totalItemsSold,
            createdAt: order.createdAt.toISOString(),
        }).catch(() => {});

        SocketDispatcher.emitToHotel(hotelId, SOCKET_EVENTS.FOOD_ORDER_CREATED, {
            orderId,
            roomSessionId: order.roomSessionId?.toString(),
            roomNumber: order.roomNumber,
            status: order.status,
            source: order.source,
        });

        res.status(201).json({
            success: true,
            message: "Food order created successfully",
            data: order,
        });
    });

    updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const orderId = (req.params.orderId as string) ?? "";
        const { status } = req.body as { status: "PREPARING" | "SERVED" | "REJECTED" };

        const order = await foodOrderService.updateOrderStatus({
            orderId,
            newStatus: status,
            ctxType: user.ctx?.type,
            ctxId: user.ctx?.id,
        });

        res.status(200).json({
            success: true,
            message: "Order status updated",
            data: order,
        });
    });

    getOrders = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const app = (req.params.app as string) ?? "";
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const search = (req.query.search as string)?.trim();
        const status = (req.query.status as string) || undefined;

        const result = await foodOrderService.getOrders({
            userId: user.sub,
            app,
            ctxType: user.ctx?.type,
            ctxId: user.ctx?.id,
            page,
            limit,
            search,
            status,
        });

        res.status(200).json({
            success: true,
            data: result,
        });
    });
}
