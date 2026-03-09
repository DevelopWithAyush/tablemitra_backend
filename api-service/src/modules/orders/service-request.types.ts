// ── Active service request types (bottom bar + status page) ──────────────────

export const ACTIVE_SERVICE_REQUEST_STATUSES = ["PENDING", "ACCEPTED", "IN_PROGRESS"] as const;
export type ActiveServiceRequestStatus = (typeof ACTIVE_SERVICE_REQUEST_STATUSES)[number];

/** Minimal shape returned for the bottom bar — no item list, no hotel name. */
export interface ActiveServiceRequestSummary {
    _id: string;
    status: ActiveServiceRequestStatus;
    createdAt: string;
}

/** Bill breakdown (same shape as food order). */
export interface ServiceRequestBill {
    subtotal: number;
    serviceCharge: number;
    gstAndOther: number;
    toPay: number;
}

/** Full shape returned for the service-request status page carousel. */
export interface ActiveServiceRequest {
    _id: string;
    status: ActiveServiceRequestStatus;
    roomNumber: string;
    note: string | null;
    items: Array<{
        itemName: string;
        categoryName: string;
        quantity: number;
    }>;
    totalAmount: number;
    bill: ServiceRequestBill;
    /** Set when staff moves to ACCEPTED. */
    acceptedAt: string | null;
    /** Set when staff moves to IN_PROGRESS. */
    startedAt: string | null;
    createdAt: string;
    hotel: { name: string; address: string };
}

// ── Placement types ───────────────────────────────────────────────────────────

/** What the client sends — only identity + quantity. Everything else comes from DB. */
export interface ServiceRequestItemInput {
    itemId: string;
    quantity: number;
}

/** Fully-resolved item stored in the DB (enriched by the backend from ServiceItem). */
export interface ServiceRequestItemResolved {
    itemId: string;
    itemName: string;
    categoryId: string;
    categoryName: string;
    price: number;
    quantity: number;
}

export interface PlaceServiceRequestBody {
    items: ServiceRequestItemInput[];
    /** Staff only: roomNumber to resolve the active room session */
    roomNumber?: string;
    /** Optional guest note (e.g. "collect after 3pm") */
    note?: string;
}

export interface GetServiceRequestsQuery {
    page?: number;
    limit?: number;
    search?: string;
    status?: "PENDING" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";
}

export interface ServiceRequestListResponse {
    requests: ServiceRequestListItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

export interface ServiceRequestListItem {
    _id: string;
    userId: string;
    hotelId: string;
    roomSessionId: string;
    roomNumber: string;
    items: Array<{
        itemId: string;
        itemName: string;
        categoryId: string;
        categoryName: string;
        price: number;
        quantity: number;
    }>;
    totalAmount: number;
    bill: ServiceRequestBill;
    note: string | null;
    status: string;
    paymentStatus: string;
    paidAt: Date | null;
    acceptedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    rejectedAt: Date | null;
    cancelledAt: Date | null;
    createdAt: string;
    updatedAt: string;
    /** Present for customer view: hotel name and address */
    hotel?: { name: string; address: string };
    /** Present for staff/admin view: the guest who made the request */
    customer?: {
        userId: string;
        phone: string;
        name?: string;
        profilePicture: string | null;
    };
}
