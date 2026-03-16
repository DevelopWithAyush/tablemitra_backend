import type { CheckoutAdjustmentType, CheckoutPaymentMethod } from "./db/checkout-session.model.js";

export interface CheckoutPreviewFoodOrder {
    _id: string;
    items: Array<{ itemName: string; quantity: number; variantName?: string; price?: number }>;
    bill: { subtotal: number; toPay: number };
    count: number;
    createdAt: string;
}

export interface CheckoutPreviewServiceRequest {
    _id: string;
    items: Array<{ itemName: string; quantity: number; price?: number }>;
    totalAmount: number;
    bill: { toPay: number };
    createdAt: string;
}

export interface CheckoutPreview {
    roomSessionId: string;
    roomNumber: string;
    hotelId: string;
    /** Present when viewing a past checkout; use for Print Bill API */
    checkoutSessionId?: string;
    /** When true: hide Proceed button, show only Print Bill */
    isAlreadyCheckout: boolean;
    foodOrders: CheckoutPreviewFoodOrder[];
    serviceRequests: CheckoutPreviewServiceRequest[];
    ordersSubtotal: number;
    /** Applied adjustments (only when isAlreadyCheckout) */
    adjustments?: Array<{ type: string; amount: number; label?: string }>;
    /** Final billed amount (only when isAlreadyCheckout) */
    finalAmount?: number;
    guestDetails?: { name?: string; phone?: string }[];
}

export interface CheckoutAdjustmentInput {
    type: CheckoutAdjustmentType;
    amount: number;
    label?: string;
}

export interface ProceedCheckoutInput {
    roomSessionId: string;
    adjustments: CheckoutAdjustmentInput[];
    paymentMethod: CheckoutPaymentMethod;
    guestDetails?: { name?: string; phone?: string };
}

export interface CheckoutHistoryItem {
    checkoutSessionId: string;
    roomSessionId: string;
    roomNumber: string;
    paidAt: string;
    finalAmount: number;
    guestDetails?: { name?: string; phone?: string };
}
