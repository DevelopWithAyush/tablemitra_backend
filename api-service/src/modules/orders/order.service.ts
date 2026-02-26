import FoodOrderModel, {
    type FoodOrderChannelType,
    type FoodOrderSourceType,
} from "./db/food-order.model.js";
import type { OrderItemInput, OrderListResponse, OrderListItem } from "./order.types.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import authService from "../auth/auth.service.js";
import { publishFoodOrderEvent } from "./order.analytics.publisher.js";

type OrderItemInputInternal = OrderItemInput;

function computeBillAndCount(items: OrderItemInputInternal[]): {
    bill: { subtotal: number; serviceCharge: number; gstAndOther: number; toPay: number };
    count: number;
} {
    let subtotal = 0;
    let count = 0;
    for (const it of items) {
        const price = it.discountedPrice ?? it.price;
        subtotal += price * it.quantity;
        count += it.quantity;
    }
    return {
        bill: { subtotal, serviceCharge: 0, gstAndOther: 0, toPay: subtotal },
        count,
    };
}

export type CreateFoodOrderParams = {
    hotelId: string;
    placedById: string;
    source: FoodOrderSourceType;
    channelType: FoodOrderChannelType;
    items: OrderItemInputInternal[];
    customerId?: string | null;
    orderedForStaffId?: string | null;
    roomSessionId?: string | null;
    roomNumber?: string | null;
    tableNumber?: string | null;
    zone?: string | null;
    cookingRequest?: string | null;
};

function validateChannelFields(params: CreateFoodOrderParams): void {
    if (params.channelType === "ROOM") {
        if (!params.roomSessionId || !params.roomNumber) {
            throw new Error("roomSessionId and roomNumber are required when channelType is ROOM");
        }
    }
    if (params.channelType === "RESTAURANT" || params.channelType === "BAR") {
        if (!params.tableNumber) {
            throw new Error("tableNumber is required when channelType is RESTAURANT or BAR");
        }
    }
}

export const foodOrderService = {
    createFoodOrder: async (params: CreateFoodOrderParams) => {
        validateChannelFields(params);
        const { bill, count } = computeBillAndCount(params.items);
        const doc = await FoodOrderModel.create({
            hotelId: params.hotelId,
            placedById: params.placedById,
            source: params.source,
            channelType: params.channelType,
            customerId: params.customerId ?? null,
            orderedForStaffId: params.orderedForStaffId ?? null,
            roomSessionId: params.roomSessionId ?? null,
            roomNumber: params.roomNumber ?? null,
            tableNumber: params.tableNumber ?? null,
            zone: params.zone ?? null,
            cookingRequest: params.cookingRequest ?? null,
            items: params.items,
            bill,
            count,
        });
        return doc;
    },

    createGuestRoomOrder: async (
        customerId: string,
        hotelId: string,
        roomSessionId: string,
        roomNumber: string,
        items: OrderItemInputInternal[],
        cookingRequest?: string | null
    ) => {
        return foodOrderService.createFoodOrder({
            hotelId,
            placedById: customerId,
            source: "GUEST",
            channelType: "ROOM",
            customerId,
            roomSessionId,
            roomNumber,
            items,
            cookingRequest: cookingRequest ?? null,
        });
    },

    /**
     * Place order: customer uses cookies; staff sends roomNumber (or forStaff). Resolves room session for staff.
     * Returns created order. Caller is responsible for socket emit and analytics publish after.
     */
    placeOrder: async (params: {
        userId: string;
        app: string;
        items: OrderItemInputInternal[];
        roomNumber?: string;
        forStaff?: boolean;
        cookingRequest?: string | null;
        customerRoomHotelId?: string;
        customerRoomSessionId?: string;
        customerRoomNumber?: string;
        staffHotelId?: string;
    }) => {
        const isCustomer = params.app === "customer";

        if (isCustomer) {
            const hotelId = params.customerRoomHotelId;
            const roomSessionId = params.customerRoomSessionId;
            const roomNumber = params.customerRoomNumber;
            if (!hotelId || !roomSessionId || !roomNumber) {
                throw new Error("Room context required. Please scan room QR or ensure cookies are set.");
            }
            return foodOrderService.createGuestRoomOrder(
                params.userId,
                hotelId,
                roomSessionId,
                roomNumber,
                params.items,
                params.cookingRequest
            );
        }

        // Staff
        if (params.forStaff) {
            return foodOrderService.createFoodOrder({
                hotelId: params.staffHotelId!,
                placedById: params.userId,
                source: "STAFF",
                channelType: "INTERNAL",
                items: params.items,
                cookingRequest: params.cookingRequest ?? null,
            });
        }

        const roomNumber = params.roomNumber?.trim();
        if (!roomNumber) {
            throw new Error("roomNumber is required when staff places order for a guest");
        }
        const hotelId = params.staffHotelId;
        if (!hotelId) {
            throw new Error("Staff hotel context required");
        }

        const sessionResult = await hospitalityService.getActiveRoomSessionForOrder(hotelId, roomNumber);
        if (!sessionResult.success || !sessionResult.data) {
            throw new Error(sessionResult.message ?? "No active room session for this room");
        }

        const { roomSessionId, customerId } = sessionResult.data;
        return foodOrderService.createFoodOrder({
            hotelId,
            placedById: params.userId,
            source: "STAFF_FOR_GUEST",
            channelType: "ROOM",
            customerId: customerId ?? null,
            roomSessionId,
            roomNumber: sessionResult.data.roomNumber,
            items: params.items,
            cookingRequest: params.cookingRequest ?? null,
        });
    },

    /**
     * Update order status (PREPARING, SERVED, REJECTED). Publishes analytics status-change event.
     * Access: hotel staff (ctx.id = hotelId) or chain/founder (order's hotel in chain).
     */
    updateOrderStatus: async (params: {
        orderId: string;
        newStatus: "PREPARING" | "SERVED" | "REJECTED";
        ctxType?: string;
        ctxId?: string;
    }) => {
        const order = await FoodOrderModel.findById(params.orderId).lean();
        if (!order) throw new Error("Order not found");

        const hotelId = (order.hotelId as { toString: () => string }).toString();
        if (params.ctxType === "HOTEL" && params.ctxId && params.ctxId !== hotelId) {
            throw new Error("Forbidden: order does not belong to your hotel");
        }
        if (params.ctxType === "CHAIN" && params.ctxId) {
            const hotelIds = await hospitalityService.getHotelIdsByChainId(params.ctxId);
            if (!hotelIds.includes(hotelId)) throw new Error("Forbidden: order does not belong to your chain");
        }
        if (!params.ctxType || !params.ctxId) throw new Error("Context required");

        const previousStatus = order.status as string;
        const validTransitions: Record<string, string[]> = {
            PENDING: ["PREPARING", "REJECTED"],
            PREPARING: ["SERVED", "REJECTED"],
        };
        const allowed = validTransitions[previousStatus];
        if (!allowed || !allowed.includes(params.newStatus)) {
            throw new Error(`Invalid transition from ${previousStatus} to ${params.newStatus}`);
        }

        const now = new Date();
        const update: Record<string, unknown> = { status: params.newStatus };
        if (params.newStatus === "PREPARING") update.acceptedAt = now;
        if (params.newStatus === "SERVED") update.servedAt = now;
        if (params.newStatus === "REJECTED") update.rejectedAt = now;

        await FoodOrderModel.findByIdAndUpdate(params.orderId, { $set: update });

        const hotelRes = await hospitalityService.getHotelById(hotelId);
        const rawChain = hotelRes.success && hotelRes.data ? (hotelRes.data as { chainId?: { _id?: unknown } | string }).chainId : undefined;
        const chainId = rawChain ? (typeof rawChain === "object" && rawChain._id ? String(rawChain._id) : String(rawChain)) : undefined;

        const orderItems = (order.items ?? []) as Array<{ isUpsell?: boolean; price: number; discountedPrice?: number; quantity: number }>;
        const upsellRevenue = orderItems
            .filter((i) => i.isUpsell)
            .reduce((sum, i) => sum + ((i.discountedPrice ?? i.price) ?? 0) * (i.quantity ?? 0), 0);
        const totalItemsSold = orderItems.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
        const amount = order.source === "STAFF" ? 0 : (order.bill as { toPay?: number })?.toPay ?? 0;

        const eventMap = { PREPARING: "ORDER_PREPARING" as const, SERVED: "ORDER_SERVED" as const, REJECTED: "ORDER_REJECTED" as const };
        publishFoodOrderEvent({
            event: eventMap[params.newStatus],
            orderId: params.orderId,
            hotelId,
            chainId,
            source: order.source as "GUEST" | "STAFF_FOR_GUEST" | "STAFF",
            channelType: order.channelType,
            amount,
            upsellRevenue,
            totalItemsSold,
            createdAt: (order.createdAt as Date).toISOString(),
            previousStatus,
            newStatus: params.newStatus,
            servedAt: params.newStatus === "SERVED" ? now.toISOString() : undefined,
            acceptedAt: params.newStatus === "PREPARING" ? now.toISOString() : undefined,
            rejectedAt: params.newStatus === "REJECTED" ? now.toISOString() : undefined,
        }).catch(() => {});

        return await FoodOrderModel.findById(params.orderId).lean();
    },

    /**
     * List orders with role-based filter and enrichment. Uses hospitality + auth services (DDD).
     */
    getOrders: async (params: {
        userId: string;
        app: string;
        ctxType?: string;
        ctxId?: string;
        page: number;
        limit: number;
        search?: string;
        status?: string;
    }): Promise<OrderListResponse> => {
        const filter: Record<string, unknown> = {};

        if (params.app === "customer") {
            filter.$or = [{ placedById: params.userId }, { customerId: params.userId }];
        } else if (params.ctxType === "HOTEL" && params.ctxId) {
            filter.hotelId = params.ctxId;
        } else if (params.ctxType === "CHAIN" && params.ctxId) {
            const hotelIds = await hospitalityService.getHotelIdsByChainId(params.ctxId);
            if (hotelIds.length === 0) filter.hotelId = null;
            else filter.hotelId = { $in: hotelIds };
        } else {
            filter._id = null;
        }

        if (params.search?.trim()) {
            const s = params.search.trim();
            const searchCond = {
                $or: [
                    { roomNumber: { $regex: s, $options: "i" } },
                    { tableNumber: { $regex: s, $options: "i" } },
                ],
            };
            filter.$and = filter.$and ?? [];
            (filter.$and as unknown[]).push(searchCond);
        }

        if (params.status) {
            filter.status = params.status;
        }

        const skip = (params.page - 1) * params.limit;

        const total = await FoodOrderModel.countDocuments(filter);

        const orders: Record<string, unknown>[] =
            params.status != null
                ? await FoodOrderModel.find(filter)
                      .sort({ createdAt: -1 })
                      .skip(skip)
                      .limit(params.limit)
                      .lean()
                : await FoodOrderModel.aggregate([
                      { $match: filter },
                      {
                          $addFields: {
                              statusOrder: {
                                  $switch: {
                                      branches: [
                                          { case: { $eq: ["$status", "PENDING"] }, then: 1 },
                                          { case: { $eq: ["$status", "PREPARING"] }, then: 2 },
                                          { case: { $eq: ["$status", "SERVED"] }, then: 3 },
                                          { case: { $eq: ["$status", "REJECTED"] }, then: 4 },
                                      ],
                                      default: 5,
                                  },
                              },
                          },
                      },
                      { $sort: { statusOrder: 1, createdAt: -1 } },
                      { $skip: skip },
                      { $limit: params.limit },
                  ]);

        const list: OrderListItem[] = orders.map((o: Record<string, unknown>) => ({
            _id: (o._id as { toString: () => string }).toString(),
            hotelId: (o.hotelId as { toString: () => string }).toString(),
            placedById: (o.placedById as { toString: () => string }).toString(),
            source: o.source as string,
            channelType: o.channelType as string,
            customerId: o.customerId ? (o.customerId as { toString: () => string }).toString() : null,
            roomSessionId: o.roomSessionId ? (o.roomSessionId as { toString: () => string }).toString() : null,
            roomNumber: (o.roomNumber as string) ?? null,
            tableNumber: (o.tableNumber as string) ?? null,
            zone: (o.zone as string) ?? null,
            status: o.status as string,
            cookingRequest: (o.cookingRequest as string) ?? null,
            items: (o.items as unknown[]) as OrderListItem["items"],
            bill: o.bill as OrderListItem["bill"],
            count: o.count as number,
            paymentStatus: o.paymentStatus as string,
            paidAt: (o.paidAt as Date) ?? null,
            createdAt: (o.createdAt as Date).toISOString(),
            updatedAt: (o.updatedAt as Date).toISOString(),
        }));

        const view = params.app === "customer" ? "customer" : params.ctxType === "CHAIN" ? "admin" : "staff";
        const uniqueHotelIds = [...new Set(list.map((o) => o.hotelId))];
        const uniqueCustomerIds = [...new Set(list.map((o) => o.customerId).filter(Boolean))] as string[];

        if (view === "customer") {
            for (const hotelId of uniqueHotelIds) {
                const res = await hospitalityService.getHotelContextForCustomer(hotelId);
                const name = res.success && res.data ? res.data.name : "";
                const address = res.success && res.data ? res.data.address : "";
                for (const o of list) {
                    if (o.hotelId === hotelId) o.hotel = { name, address };
                }
            }
        } else if (view === "staff") {
            for (const uid of uniqueCustomerIds) {
                const user = await authService.getUserById(uid);
                const phone = user?.phone ?? "";
                for (const o of list) {
                    if (o.customerId === uid) o.customer = { userId: uid, phone };
                }
            }
        } else {
            for (const hotelId of uniqueHotelIds) {
                const res = await hospitalityService.getHotelById(hotelId);
                const name = res.success && res.data ? (res.data.name as string) : "";
                const addr = res.success && res.data && res.data.address ? (res.data.address as { street?: string; city?: string; state?: string; country?: string; pincode?: string }) : null;
                const address = addr
                    ? [addr.street, addr.city, addr.state, addr.country].filter(Boolean).join(", ") + (addr.pincode ? ` - ${addr.pincode}` : "")
                    : "";
                for (const o of list) {
                    if (o.hotelId === hotelId) o.hotel = { name, address };
                }
            }
            for (const uid of uniqueCustomerIds) {
                const user = await authService.getUserById(uid);
                const phone = user?.phone ?? "";
                for (const o of list) {
                    if (o.customerId === uid) o.customer = { userId: uid, phone };
                }
            }
        }

        return {
            orders: list,
            total,
            page: params.page,
            limit: params.limit,
            hasMore: skip + list.length < total,
        };
    },
};
