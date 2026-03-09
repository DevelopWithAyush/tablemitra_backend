import FoodOrderModel, {
    type FoodOrderChannelType,
    type FoodOrderSourceType,
} from "./db/food-order.model.js";
import { ACTIVE_FOOD_ORDER_STATUSES } from "./food-order.types.js";
import type {
    OrderItemInput,
    OrderListResponse,
    OrderListItem,
    ActiveFoodOrderSummary,
    ActiveFoodOrder,
} from "./food-order.types.js";
import { computeBillFromTaxableLines } from "./bill.util.js";
import menuService from "../menu/menu.service.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import authService from "../auth/auth.service.js";
import { publishFoodOrderEvent } from "./order.analytics.publisher.js";

type OrderItemInputInternal = OrderItemInput;

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

/** Convert a single order doc to GET-order list item shape with customer enriched (for socket / staff view). */
function orderDocToListItem(o: Record<string, unknown>): OrderListItem {
    return {
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
        createdAt: (o.createdAt as Date)?.toISOString?.() ?? new Date(o.createdAt as Date).toISOString(),
        updatedAt: (o.updatedAt as Date)?.toISOString?.() ?? new Date(o.updatedAt as Date).toISOString(),
    };
}

/** Build GET-order list item from a single order (doc or plain) with customer enriched. For socket emit. */
async function orderToListItemWithCustomer(
    order: Record<string, unknown> | { toObject(): Record<string, unknown> }
): Promise<OrderListItem> {
    const o: Record<string, unknown> =
        order && typeof (order as { toObject?: () => Record<string, unknown> }).toObject === "function"
            ? (order as { toObject(): Record<string, unknown> }).toObject()
            : (order as Record<string, unknown>);
    const item = orderDocToListItem(o);
    const customerId = item.customerId;
    if (customerId) {
        const profile = await authService.getCustomerProfileForOrder(customerId);
        if (profile) item.customer = profile;
        else item.customer = { userId: customerId, phone: "", profilePicture: null };
    }
    return item;
}

export const foodOrderService = {
    orderToListItemWithCustomer,

    createFoodOrder: async (params: CreateFoodOrderParams) => {
        validateChannelFields(params);

        const resolved = await menuService.getItemsWithTaxes(params.hotelId, params.items);
        const bill = computeBillFromTaxableLines(
            resolved.map((r) => ({
                price: r.price,
                discountedPrice: r.discountedPrice,
                quantity: r.quantity,
                taxes: r.taxes,
            }))
        );
        const count = resolved.reduce((sum, r) => sum + r.quantity, 0);
        const itemsToStore = resolved.map((r) => ({
            itemId: r.itemId,
            itemName: r.itemName,
            price: r.price,
            discountedPrice: r.discountedPrice,
            quantity: r.quantity,
            variantId: r.variantId,
            variantName: r.variantName,
            isUpsell: r.isUpsell,
        }));

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
            items: itemsToStore,
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

        const orders = await FoodOrderModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(params.limit)
            .lean();

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
                const profile = await authService.getCustomerProfileForOrder(uid);
                if (profile) {
                    for (const o of list) {
                        if (o.customerId === uid) o.customer = profile;
                    }
                } else {
                    for (const o of list) {
                        if (o.customerId === uid) o.customer = { userId: uid, phone: "", profilePicture: null };
                    }
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
                const profile = await authService.getCustomerProfileForOrder(uid);
                if (profile) {
                    for (const o of list) {
                        if (o.customerId === uid) o.customer = profile;
                    }
                } else {
                    for (const o of list) {
                        if (o.customerId === uid) o.customer = { userId: uid, phone: "", profilePicture: null };
                    }
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

    /**
     * Bottom-bar summary: IDs + statuses of active food orders for this customer
     * scoped to their current hotel stay. Intentionally slim — no item list.
     */
    getActiveFoodOrdersSummary: async (userId: string, hotelId: string): Promise<ActiveFoodOrderSummary[]> => {
        const docs = await FoodOrderModel.find({
            hotelId,
            $or: [{ placedById: userId }, { customerId: userId }],
            status: { $in: ACTIVE_FOOD_ORDER_STATUSES as unknown as string[] },
        })
            .select("_id status createdAt")
            .sort({ createdAt: 1 })
            .lean();

        return docs.map((d) => ({
            _id: (d._id as { toString(): string }).toString(),
            status: d.status as ActiveFoodOrderSummary["status"],
            createdAt: (d.createdAt as Date).toISOString(),
        }));
    },

    /**
     * Status page: full active food orders for the carousel view, scoped to the
     * customer's current hotel. Sorted oldest-first so the first order placed
     * appears first in the carousel. Enriched with hotel name and address.
     */
    getActiveFoodOrders: async (userId: string, hotelId: string): Promise<ActiveFoodOrder[]> => {
        const docs = await FoodOrderModel.find({
            hotelId,
            $or: [{ placedById: userId }, { customerId: userId }],
            status: { $in: ACTIVE_FOOD_ORDER_STATUSES as unknown as string[] },
        })
            .select("_id status channelType roomNumber cookingRequest items bill count acceptedAt createdAt")
            .sort({ createdAt: 1 })
            .lean();

        // hotelId is already known — single fetch, no N+1
        const hotelRes = await hospitalityService.getHotelContextForCustomer(hotelId);
        const hotel = {
            name: hotelRes.success && hotelRes.data ? hotelRes.data.name : "",
            address: hotelRes.success && hotelRes.data ? hotelRes.data.address : "",
        };

        return docs.map((d) => {
            const rawItems = (d.items as Array<{ itemName: string; quantity: number; variantName?: string }>) ?? [];
            const bill = d.bill as { subtotal: number; toPay: number };

            return {
                _id: (d._id as { toString(): string }).toString(),
                status: d.status as ActiveFoodOrder["status"],
                channelType: d.channelType as string,
                roomNumber: (d.roomNumber as string) ?? null,
                cookingRequest: (d.cookingRequest as string) ?? null,
                items: rawItems.map((i) => ({
                    itemName: i.itemName,
                    quantity: i.quantity,
                    ...(i.variantName ? { variantName: i.variantName } : {}),
                })),
                bill: { subtotal: bill.subtotal, toPay: bill.toPay },
                count: d.count as number,
                acceptedAt: d.acceptedAt ? (d.acceptedAt as Date).toISOString() : null,
                createdAt: (d.createdAt as Date).toISOString(),
                hotel,
            };
        });
    },
};
