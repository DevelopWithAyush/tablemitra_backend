/**
 * Order module types. Response shapes and filters stay here; no cross-module model imports.
 */

export interface OrderItemInput {
    itemId: string;
    itemName: string;
    price: number;
    discountedPrice?: number;
    quantity: number;
    variantId?: string;
    variantName?: string;
    isUpsell?: boolean;
}

/** Place order body: customer sends only items; staff sends items + roomNumber (and optionally forStaff). */
export interface PlaceOrderBody {
    items: OrderItemInput[];
    roomNumber?: string;
    /** When true, staff places order for themselves (channel INTERNAL, source STAFF). */
    forStaff?: boolean;
}

/** List orders query: pagination + optional search. */
export interface GetOrdersQuery {
    page?: number;
    limit?: number;
    search?: string;
}

/** Role-based list result: customer sees hotel name/address; staff sees customer; admin sees both. */
export interface OrderListResponse {
    orders: OrderListItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

export interface OrderListItem {
    _id: string;
    hotelId: string;
    placedById: string;
    source: string;
    channelType: string;
    customerId: string | null;
    roomSessionId: string | null;
    roomNumber: string | null;
    tableNumber: string | null;
    zone: string | null;
    status: string;
    items: Array<{
        itemId: string;
        itemName: string;
        price: number;
        discountedPrice?: number;
        quantity: number;
        variantId?: string;
        variantName?: string;
        isUpsell: boolean;
    }>;
    bill: { subtotal: number; serviceCharge: number; gstAndOther: number; toPay: number };
    count: number;
    paymentStatus: string;
    paidAt: Date | null;
    createdAt: string;
    updatedAt: string;
    /** Populated for customer list: hotel name and address. */
    hotel?: { name: string; address: string };
    /** Populated for staff/admin list: customer phone (and optionally name). */
    customer?: { userId: string; phone: string };
}
