import { Types } from "mongoose";
import ServiceRequestModel, { type ServiceRequestStatus } from "./db/service-request.model.js";
import { ACTIVE_SERVICE_REQUEST_STATUSES } from "./service-request.types.js";
import type {
    ServiceRequestListItem,
    ServiceRequestListResponse,
    ActiveServiceRequestSummary,
    ActiveServiceRequest,
    ServiceRequestBill,
} from "./service-request.types.js";
import { computeBillFromTaxableLines } from "./bill.util.js";
import serviceOptimizationService from "../service/service.service.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import authService from "../auth/auth.service.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeBill(o: Record<string, unknown>): ServiceRequestBill {
    const total = (o.totalAmount as number) ?? 0;
    const b = o.bill as Partial<ServiceRequestBill> | undefined;
    if (b && typeof b.subtotal === "number" && typeof b.toPay === "number") {
        return {
            subtotal: b.subtotal,
            serviceCharge: b.serviceCharge ?? 0,
            gstAndOther: b.gstAndOther ?? 0,
            toPay: b.toPay,
        };
    }
    return { subtotal: total, serviceCharge: 0, gstAndOther: 0, toPay: total };
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
        bill: normalizeBill(o),
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

        // ── Resolve & validate items via service module (DDD); compute bill from item taxes ────────
        const resolved = await serviceOptimizationService.getServiceItemsForRequest(hotelId, params.items);

        const bill = computeBillFromTaxableLines(
            resolved.map((r) => ({
                price: r.price,
                quantity: r.quantity,
                taxes: r.taxes,
            }))
        );

        const resolvedItems = resolved.map((r) => ({
            itemId: new Types.ObjectId(r.itemId),
            itemName: r.itemName,
            categoryId: new Types.ObjectId(r.categoryId),
            categoryName: r.categoryName,
            price: r.price,
            quantity: r.quantity,
        }));

        const [request] = await ServiceRequestModel.create([
            {
                userId: new Types.ObjectId(params.userId),
                hotelId: new Types.ObjectId(hotelId),
                roomSessionId: new Types.ObjectId(roomSessionId),
                roomNumber,
                items: resolvedItems,
                totalAmount: bill.toPay,
                bill: {
                    subtotal: bill.subtotal,
                    serviceCharge: bill.serviceCharge,
                    gstAndOther: bill.gstAndOther,
                    toPay: bill.toPay,
                },
                note: params.note ?? null,
            },
        ]);
        await hospitalityService.invalidateHotelQrCache(hotelId);
        return request!;
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
     * Billable stats by room session (for room list / QR). Counts and sum of toPay for requests
     * that are billable: status not in [REJECTED, CANCELLED], paymentStatus PENDING.
     * DDD: called by qr-code module when deriving stats for occupied rooms.
     */
    getBillableStatsByRoomSessionIds: async (
        roomSessionIds: string[]
    ): Promise<Map<string, { count: number; totalSpend: number }>> => {
        if (roomSessionIds.length === 0) return new Map();
        const ids = roomSessionIds.map((id) => new Types.ObjectId(id));
        const rows = await ServiceRequestModel.aggregate<{
            _id: Types.ObjectId;
            count: number;
            totalSpend: number;
        }>([
            {
                $match: {
                    roomSessionId: { $in: ids },
                    status: { $nin: ["REJECTED", "CANCELLED"] },
                    paymentStatus: "PENDING",
                },
            },
            {
                $group: {
                    _id: "$roomSessionId",
                    count: { $sum: 1 },
                    totalSpend: { $sum: { $ifNull: ["$bill.toPay", "$totalAmount"] } },
                },
            },
        ]);
        const map = new Map<string, { count: number; totalSpend: number }>();
        for (const r of rows) {
            map.set(r._id.toString(), { count: r.count, totalSpend: r.totalSpend });
        }
        return map;
    },

    /**
     * Get pending-payment service requests for a room session (for checkout).
     * Excludes REJECTED and CANCELLED. Uses stored bill/totalAmount – no recalculation.
     * DDD: called by checkout module via service.
     */
    getPendingServiceRequestsByRoomSessionId: async (roomSessionId: string) => {
        const docs = await ServiceRequestModel.find({
            roomSessionId: new Types.ObjectId(roomSessionId),
            paymentStatus: "PENDING",
            status: { $nin: ["REJECTED", "CANCELLED"] },
        })
            .select("_id items totalAmount bill createdAt")
            .sort({ createdAt: 1 })
            .lean();

        return docs.map((d: Record<string, unknown>) => {
            const bill = d.bill as Partial<{ subtotal: number; gstAndOther: number; toPay: number }> | undefined;
            const toPay = bill?.toPay ?? (d.totalAmount as number);
            return {
                _id: (d._id as { toString(): string }).toString(),
                items: (d.items as unknown[]) ?? [],
                totalAmount: d.totalAmount as number,
                bill: bill ? { ...bill, toPay } : { subtotal: toPay, gstAndOther: 0, toPay },
                createdAt: (d.createdAt as Date).toISOString(),
            };
        });
    },

    /**
     * Get service requests by IDs for bill PDF. DDD: called by checkout module.
     */
    getServiceRequestsByIdsForBill: async (requestIds: string[]) => {
        if (requestIds.length === 0) return [];
        const docs = await ServiceRequestModel.find({
            _id: { $in: requestIds.map((id) => new Types.ObjectId(id)) },
        })
            .select("items totalAmount bill createdAt")
            .sort({ createdAt: 1 })
            .lean();

        return docs.map((d: Record<string, unknown>) => {
            const bill = d.bill as Partial<{ toPay: number }> | undefined;
            const toPay = bill?.toPay ?? (d.totalAmount as number);
            return {
                _id: (d._id as Types.ObjectId).toString(),
                items: (d.items as unknown[]) ?? [],
                totalAmount: d.totalAmount as number,
                bill: { toPay },
                createdAt: (d.createdAt as Date).toISOString(),
            };
        });
    },

    /**
     * Mark service requests as paid (called by checkout module on successful checkout).
     */
    markServiceRequestsPaid: async (requestIds: string[]): Promise<void> => {
        const now = new Date();
        await ServiceRequestModel.updateMany(
            { _id: { $in: requestIds.map((id) => new Types.ObjectId(id)) } },
            { $set: { paymentStatus: "PAID", paidAt: now } }
        );
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
        await hospitalityService.invalidateHotelQrCache(hotelId);
        return ServiceRequestModel.findById(params.requestId).lean();
    },

    /**
     * Bottom-bar summary: IDs + statuses of active service requests for this customer
     * scoped to their current hotel stay. Intentionally slim — no item list.
     */
    getActiveServiceRequestsSummary: async (userId: string, hotelId: string): Promise<ActiveServiceRequestSummary[]> => {
        const docs = await ServiceRequestModel.find({
            userId,
            hotelId,
            status: { $in: ACTIVE_SERVICE_REQUEST_STATUSES as unknown as string[] },
        })
            .select("_id status createdAt")
            .sort({ createdAt: 1 })
            .lean();

        return docs.map((d) => ({
            _id: (d._id as { toString(): string }).toString(),
            status: d.status as ActiveServiceRequestSummary["status"],
            createdAt: (d.createdAt as Date).toISOString(),
        }));
    },

    /**
     * Status page: full active service requests for the carousel view, scoped to the
     * customer's current hotel. Sorted oldest-first so the earliest request appears
     * first in the carousel. Enriched with hotel name and address.
     */
    getActiveServiceRequests: async (userId: string, hotelId: string): Promise<ActiveServiceRequest[]> => {
        const docs = await ServiceRequestModel.find({
            userId,
            hotelId,
            status: { $in: ACTIVE_SERVICE_REQUEST_STATUSES as unknown as string[] },
        })
            .select("_id status roomNumber note items totalAmount acceptedAt startedAt createdAt")
            .sort({ createdAt: 1 })
            .lean();

        // hotelId is already known — single fetch, no N+1
        const hotelRes = await hospitalityService.getHotelContextForCustomer(hotelId);
        const hotel = {
            name: hotelRes.success && hotelRes.data ? hotelRes.data.name : "",
            address: hotelRes.success && hotelRes.data ? hotelRes.data.address : "",
        };

        return docs.map((d) => {
            const rawItems = (d.items as Array<{ itemName: string; categoryName: string; quantity: number }>) ?? [];
            const bill = normalizeBill(d as unknown as Record<string, unknown>);

            return {
                _id: (d._id as { toString(): string }).toString(),
                status: d.status as ActiveServiceRequest["status"],
                roomNumber: d.roomNumber as string,
                note: (d.note as string) ?? null,
                items: rawItems.map((i) => ({
                    itemName: i.itemName,
                    categoryName: i.categoryName,
                    quantity: i.quantity,
                })),
                totalAmount: d.totalAmount as number,
                bill,
                acceptedAt: d.acceptedAt ? (d.acceptedAt as Date).toISOString() : null,
                startedAt: d.startedAt ? (d.startedAt as Date).toISOString() : null,
                createdAt: (d.createdAt as Date).toISOString(),
                hotel,
            };
        });
    },
};
