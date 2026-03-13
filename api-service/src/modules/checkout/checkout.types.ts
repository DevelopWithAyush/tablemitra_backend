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
    foodOrders: CheckoutPreviewFoodOrder[];
    serviceRequests: CheckoutPreviewServiceRequest[];
    ordersSubtotal: number;
    guestDetails?: { name?: string; phone?: string }[];
}

export interface CheckoutAdjustmentInput {
    type: CheckoutAdjustmentType;
    amount: number;
    label?: string;
}

export interface ProceedCheckoutInput {
    hotelId: string;
    roomNumber: string;
    adjustments: CheckoutAdjustmentInput[];
    paymentMethod: CheckoutPaymentMethod;
    guestDetails?: { name?: string; phone?: string };
}
