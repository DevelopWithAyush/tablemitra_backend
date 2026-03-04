import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { IJwtPayload } from "../auth/auth.types.js";
import { foodOrderService } from "./food-order.service.js";
import { resolveFoodOrderTargetRoom } from "./order.routing.service.js";
import type { OrderItemInput } from "./food-order.types.js";
import { SocketDispatcher } from "../../infra/socket/socket.dispatcher.js";
import { SOCKET_EVENTS } from "../../infra/socket/socket.events.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import { publishFoodOrderEvent } from "./order.analytics.publisher.js";
import { publishAuditEvent } from "../audit/audit.publisher.js";
import type { ActorRole, AuditAction } from "../audit/audit.types.js";

// Maps JWT app → ActorRole for audit events
const APP_TO_ACTOR_ROLE: Record<string, ActorRole> = {
    customer: "CUSTOMER",
    manager: "MANAGER",
    frontdesk: "FRONTDESK_STAFF",
    kitchen: "KITCHEN_STAFF",
    "room-service": "ROOM_SERVICE_STAFF",
    founder: "FOUNDER",
    admin: "ADMIN",
};

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

        publishAuditEvent(
            "ORDER_CREATED",
            "FOOD_ORDER",
            orderId,
            { userId: user.sub, role: APP_TO_ACTOR_ROLE[app] ?? "CUSTOMER" },
            {
                context: { hotelId, chainId, ip: req.ip, userAgent: req.get("User-Agent") ?? undefined, panel: app },
                newData: {
                    source: order.source,
                    channelType: order.channelType,
                    roomNumber: order.roomNumber ?? undefined,
                    itemCount: totalItemsSold,
                    totalAmount: amount,
                },
            }
        ).catch(() => {});

        const [orderPayload, { department, room }] = await Promise.all([
            foodOrderService.orderToListItemWithCustomer(order),
            resolveFoodOrderTargetRoom(hotelId),
        ]);

        // Route new-order alert to the active department (KITCHEN → ROOM_SERVICE → FRONT_DESK)
        SocketDispatcher.emitToDepartment(hotelId, department, SOCKET_EVENTS.FOOD_ORDER_ALERT, orderPayload);

        // Broadcast to hotel-wide room so manager and all staff observers stay in sync
        SocketDispatcher.emitToHotel(hotelId, SOCKET_EVENTS.FOOD_ORDER_CREATED, { ...orderPayload, _routedTo: department });

        void room;

        res.status(201).json({
            success: true,
            message: "Food order created successfully",
            data: order,
        });
    });

    updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const app = (req.params.app as string) ?? "";
        const orderId = (req.params.orderId as string) ?? "";
        const { status } = req.body as { status: "PREPARING" | "SERVED" | "REJECTED" };

        const order = await foodOrderService.updateOrderStatus({
            orderId,
            newStatus: status,
            ctxType: user.ctx?.type,
            ctxId: user.ctx?.id,
        });

        if (order) {
            const hotelId = (order.hotelId as { toString(): string }).toString();
            const roomSessionId = order.roomSessionId
                ? (order.roomSessionId as { toString(): string }).toString()
                : null;
            const customerId = order.customerId
                ? (order.customerId as { toString(): string }).toString()
                : null;

            const statusEventMap: Record<string, string> = {
                PREPARING: SOCKET_EVENTS.FOOD_ORDER_PREPARING,
                SERVED: SOCKET_EVENTS.FOOD_ORDER_SERVED,
                REJECTED: SOCKET_EVENTS.FOOD_ORDER_REJECTED,
            };
            const socketEvent = statusEventMap[status];
            const statusPayload = { orderId, status, hotelId };

            // 1. Notify all staff panels (manager, kitchen, frontdesk…)
            SocketDispatcher.emitToHotel(hotelId, socketEvent, statusPayload);

            // 2. Notify the customer
            if (roomSessionId) {
                SocketDispatcher.emitToRoom(roomSessionId, socketEvent, statusPayload);
            } else if (customerId) {
                SocketDispatcher.emitToUser(customerId, socketEvent, statusPayload);
            }

            // 3. Audit: record who changed the status and what it moved to
            const auditActionMap: Record<string, AuditAction> = {
                PREPARING: "ORDER_PREPARING",
                SERVED: "ORDER_SERVED",
                REJECTED: "ORDER_REJECTED",
            };
            publishAuditEvent(
                auditActionMap[status],
                "FOOD_ORDER",
                orderId,
                { userId: user.sub, role: APP_TO_ACTOR_ROLE[app] ?? "KITCHEN_STAFF" },
                {
                    context: { hotelId, ip: req.ip, userAgent: req.get("User-Agent") ?? undefined, panel: app },
                    newData: { status },
                }
            ).catch(() => {});
        }

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
