import { Types } from "mongoose";
import ServiceRequestModel, { type ServiceRequestStatus } from "./db/service-request.model.js";
import type { ServiceRequestListItem, ServiceRequestListResponse } from "./service-request.types.js";
import { ServiceItemModel } from "../service/db/item.model.js";
import { ServiceCategoryModel } from "../service/db/category.model.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import authService from "../auth/auth.service.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeTotalAmount(items: Array<{ price: number; quantity: number }>): number {
    return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

function requestDocToListItem(o: Record<string, unknown>): ServiceRequestListItem {
    return {
        _id: (o._id as { toString(): string }).toString(),
        userId: (o.userId as { toString(): string }).toString(),
        hotelId: (o.hotelId as { toString(): string }).toString(),
        roomSessionId: (o.roomSessionId as { toString(): string }).toString(),
        roomNumber: o.roomNumber as string,
        items: (o.items as unknown[]) as ServiceRequestListItem["items"],
        totalAmount: o.totalAmount as number,
        note: (o.note as string) ?? null,
        status: o.status as string,
        paymentStatus: o.paymentStatus as string,
        paidAt: (o.paidAt as Date) ?? null,
        acceptedAt: (o.acceptedAt as Date) ?? null,
        startedAt: (o.startedAt as Date) ?? null,
        completedAt: (o.completedAt as Date) ?? null,
        rejectedAt: (o.rejectedAt as Date) ?? null,
        cancelledAt: (o.cancelledAt as Date) ?? null,
        createdAt: (o.createdAt as Date)?.toISOString?.() ?? new Date(o.createdAt as Date).toISOString(),
        updatedAt: (o.updatedAt as Date)?.toISOString?.() ?? new Date(o.updatedAt as Date).toISOString(),
    };
}

/** Enrich a single service request list item with customer profile. Used for socket emit. */
export async function serviceRequestToListItemWithCustomer(
    doc: Record<string, unknown> | { toObject(): Record<string, unknown> }
): Promise<ServiceRequestListItem> {
    const o: Record<string, unknown> =
        doc && typeof (doc as { toObject?: () => Record<string, unknown> }).toObject === "function"
            ? (doc as { toObject(): Record<string, unknown> }).toObject()
            : (doc as Record<string, unknown>);
    const item = requestDocToListItem(o);
    const profile = await authService.getCustomerProfileForOrder(item.userId);
    if (profile) item.customer = profile;
    else item.customer = { userId: item.userId, phone: "", profilePicture: null };
    return item;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const serviceRequestService = {

    /**
     * Place a service request.
     * - Customer: room context from cookies (hotelId, roomSessionId, roomNumber).
     * - Staff: roomNumber in body → backend resolves active room session.
     *
     * Item details (name, category, price) are ALWAYS sourced from the DB.
     * The client only sends itemId + quantity to prevent price manipulation.
     */
    placeServiceRequest: async (params: {
        userId: string;
        app: string;
        items: Array<{ itemId: string; quantity: number }>;
        note?: string | null;
        /** Customer cookies */
        customerRoomHotelId?: string;
        customerRoomSessionId?: string;
        customerRoomNumber?: string;
        /** Staff context */
        staffHotelId?: string;
        staffRoomNumber?: string;
    }) => {
        const isCustomer = params.app === "customer";

        // ── Resolve room context ──────────────────────────────────────────
        let hotelId: string;
        let roomSessionId: string;
        let roomNumber: string;

        if (isCustomer) {
            if (!params.customerRoomHotelId || !params.customerRoomSessionId || !params.customerRoomNumber) {
                throw new Error("Room context required. Please scan room QR or ensure cookies are set.");
            }
            hotelId = params.customerRoomHotelId;
            roomSessionId = params.customerRoomSessionId;
            roomNumber = params.customerRoomNumber;
        } else {
            if (!params.staffRoomNumber) throw new Error("roomNumber is required for staff service requests");
            if (!params.staffHotelId) throw new Error("Staff hotel context required");
            const sessionResult = await hospitalityService.getActiveRoomSessionForOrder(
                params.staffHotelId,
                params.staffRoomNumber
            );
            if (!sessionResult.success || !sessionResult.data) {
                throw new Error(sessionResult.message ?? "No active room session for this room");
            }
            hotelId = params.staffHotelId;
            roomSessionId = sessionResult.data.roomSessionId;
            roomNumber = sessionResult.data.roomNumber;
        }

        // ── Validate & enrich items from DB (server-authoritative) ────────
        const itemIds = params.items.map((i) => new Types.ObjectId(i.itemId));

        const dbItems = await ServiceItemModel.find({
            _id: { $in: itemIds },
            hotelId: new Types.ObjectId(hotelId),
        })
            .select("_id name categoryId price isActive")
            .lean();

        // All requested items must exist and belong to this hotel
        if (dbItems.length !== params.items.length) {
            const foundIds = new Set(dbItems.map((i) => (i._id as Types.ObjectId).toString()));
            const missing = params.items
                .filter((i) => !foundIds.has(i.itemId))
                .map((i) => i.itemId);
            throw new Error(`Items not found or do not belong to this hotel: ${missing.join(", ")}`);
        }

        // All items must be active (not closed by management)
        const unavailable = dbItems.filter((i) => !i.isActive);
        if (unavailable.length > 0) {
            throw new Error(`Items are currently unavailable: ${unavailable.map((i) => i.name).join(", ")}`);
        }

        // Fetch category names in one query
        const categoryIds = [...new Set(dbItems.map((i) => (i.categoryId as Types.ObjectId).toString()))];
        const categories = await ServiceCategoryModel.find({
            _id: { $in: categoryIds.map((id) => new Types.ObjectId(id)) },
        })
            .select("_id name isActive")
            .lean();

        // Category must also be active
        const inactiveCategories = categories.filter((c) => !c.isActive);
        if (inactiveCategories.length > 0) {
            throw new Error(`Service categories are currently unavailable: ${inactiveCategories.map((c) => c.name).join(", ")}`);
        }

        const categoryNameMap = new Map(
            categories.map((c) => [(c._id as Types.ObjectId).toString(), c.name as string])
        );

        // Build quantity lookup from client input
        const quantityMap = new Map(params.items.map((i) => [i.itemId, i.quantity]));

        const resolvedItems = dbItems.map((dbItem) => {
            const catId = (dbItem.categoryId as Types.ObjectId).toString();
            return {
                itemId: dbItem._id as Types.ObjectId,
                itemName: dbItem.name as string,
                categoryId: dbItem.categoryId as Types.ObjectId,
                categoryName: categoryNameMap.get(catId) ?? "",
                price: dbItem.price as number,
                quantity: quantityMap.get((dbItem._id as Types.ObjectId).toString()) ?? 1,
            };
        });

        const totalAmount = computeTotalAmount(resolvedItems);

        return ServiceRequestModel.create({
            userId: new Types.ObjectId(params.userId),
            hotelId: new Types.ObjectId(hotelId),
            roomSessionId: new Types.ObjectId(roomSessionId),
            roomNumber,
            items: resolvedItems,
            totalAmount,
            note: params.note ?? null,
        });
    },

    /**
     * List service requests with role-based filtering and enrichment.
     * - Customer: own requests with hotel name/address.
     * - Staff (hotel): hotel's requests with customer profile (grouped by category on the client).
     * - Admin/Chain: hotels in chain, both hotel and customer enrichment.
     */
    getServiceRequests: async (params: {
        userId: string;
        app: string;
        ctxType?: string;
        ctxId?: string;
        page: number;
        limit: number;
        search?: string;
        status?: string;
    }): Promise<ServiceRequestListResponse> => {
        const filter: Record<string, unknown> = {};

        if (params.app === "customer") {
            filter.userId = params.userId;
        } else if (params.ctxType === "HOTEL" && params.ctxId) {
            filter.hotelId = params.ctxId;
        } else if (params.ctxType === "CHAIN" && params.ctxId) {
            const hotelIds = await hospitalityService.getHotelIdsByChainId(params.ctxId);
            filter.hotelId = hotelIds.length > 0 ? { $in: hotelIds } : null;
        } else {
            filter._id = null;
        }

        if (params.status) {
            filter.status = params.status;
        }

        if (params.search?.trim()) {
            filter.roomNumber = { $regex: params.search.trim(), $options: "i" };
        }

        const skip = (params.page - 1) * params.limit;
        const [total, docs] = await Promise.all([
            ServiceRequestModel.countDocuments(filter),
            ServiceRequestModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(params.limit)
                .lean(),
        ]);

        const list: ServiceRequestListItem[] = docs.map((o) =>
            requestDocToListItem(o as unknown as Record<string, unknown>)
        );

        const view = params.app === "customer" ? "customer" : params.ctxType === "CHAIN" ? "admin" : "staff";
        const uniqueHotelIds = [...new Set(list.map((r) => r.hotelId))];
        const uniqueUserIds = [...new Set(list.map((r) => r.userId))];

        if (view === "customer") {
            for (const hotelId of uniqueHotelIds) {
                const res = await hospitalityService.getHotelContextForCustomer(hotelId);
                const name = res.success && res.data ? res.data.name : "";
                const address = res.success && res.data ? res.data.address : "";
                for (const r of list) {
                    if (r.hotelId === hotelId) r.hotel = { name, address };
                }
            }
        } else if (view === "staff") {
            for (const uid of uniqueUserIds) {
                const profile = await authService.getCustomerProfileForOrder(uid);
                for (const r of list) {
                    if (r.userId === uid) {
                        r.customer = profile ?? { userId: uid, phone: "", profilePicture: null };
                    }
                }
            }
        } else {
            for (const hotelId of uniqueHotelIds) {
                const res = await hospitalityService.getHotelById(hotelId);
                const name = res.success && res.data ? (res.data.name as string) : "";
                const addr = res.success && res.data && res.data.address
                    ? (res.data.address as { street?: string; city?: string; state?: string; country?: string; pincode?: string })
                    : null;
                const address = addr
                    ? [addr.street, addr.city, addr.state, addr.country].filter(Boolean).join(", ") +
                      (addr.pincode ? ` - ${addr.pincode}` : "")
                    : "";
                for (const r of list) {
                    if (r.hotelId === hotelId) r.hotel = { name, address };
                }
            }
            for (const uid of uniqueUserIds) {
                const profile = await authService.getCustomerProfileForOrder(uid);
                for (const r of list) {
                    if (r.userId === uid) {
                        r.customer = profile ?? { userId: uid, phone: "", profilePicture: null };
                    }
                }
            }
        }

        return { requests: list, total, page: params.page, limit: params.limit, hasMore: skip + list.length < total };
    },

    /**
     * Update service request status.
     *
     * Staff transitions (ROOM_SERVICE / FRONTDESK):
     *   PENDING     → ACCEPTED | REJECTED
     *   ACCEPTED    → IN_PROGRESS | REJECTED
     *   IN_PROGRESS → COMPLETED
     *
     * Guest transition:
     *   PENDING → CANCELLED  (only by the owner of the request)
     */
    updateServiceRequestStatus: async (params: {
        requestId: string;
        newStatus: ServiceRequestStatus;
        actorUserId: string;
        app: string;
        ctxType?: string;
        ctxId?: string;
    }) => {
        const request = await ServiceRequestModel.findById(params.requestId).lean();
        if (!request) throw new Error("Service request not found");

        const hotelId = (request.hotelId as { toString(): string }).toString();
        const currentStatus = request.status as ServiceRequestStatus;

        // ── Access control ──────────────────────────────────────────────
        if (params.app === "customer") {
            const ownerId = (request.userId as { toString(): string }).toString();
            if (ownerId !== params.actorUserId) {
                throw new Error("Forbidden: you can only cancel your own requests");
            }
        } else {
            if (params.ctxType === "HOTEL" && params.ctxId && params.ctxId !== hotelId) {
                throw new Error("Forbidden: request does not belong to your hotel");
            }
            if (params.ctxType === "CHAIN" && params.ctxId) {
                const hotelIds = await hospitalityService.getHotelIdsByChainId(params.ctxId);
                if (!hotelIds.includes(hotelId)) {
                    throw new Error("Forbidden: request does not belong to your chain");
                }
            }
            if (!params.ctxType || !params.ctxId) throw new Error("Context required");
        }

        // ── Transition validation ───────────────────────────────────────
        const staffTransitions: Record<string, ServiceRequestStatus[]> = {
            PENDING: ["ACCEPTED", "REJECTED"],
            ACCEPTED: ["IN_PROGRESS", "REJECTED"],
            IN_PROGRESS: ["COMPLETED"],
        };
        const guestTransitions: Record<string, ServiceRequestStatus[]> = {
            PENDING: ["CANCELLED"],
        };

        const allowed = params.app === "customer"
            ? guestTransitions[currentStatus]
            : staffTransitions[currentStatus];

        if (!allowed || !allowed.includes(params.newStatus)) {
            throw new Error(`Invalid transition: ${currentStatus} → ${params.newStatus}`);
        }

        // ── Build update ────────────────────────────────────────────────
        const now = new Date();
        const update: Record<string, unknown> = { status: params.newStatus };
        if (params.newStatus === "ACCEPTED") update.acceptedAt = now;
        if (params.newStatus === "IN_PROGRESS") update.startedAt = now;
        if (params.newStatus === "COMPLETED") update.completedAt = now;
        if (params.newStatus === "REJECTED") update.rejectedAt = now;
        if (params.newStatus === "CANCELLED") update.cancelledAt = now;

        await ServiceRequestModel.findByIdAndUpdate(params.requestId, { $set: update });
        return ServiceRequestModel.findById(params.requestId).lean();
    },
};
