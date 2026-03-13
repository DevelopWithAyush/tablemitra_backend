import { Schema, model, Types } from "mongoose";

export const CHECKOUT_ADJUSTMENT_TYPE = ["DISCOUNT", "DAMAGE", "OTHER"] as const;
export type CheckoutAdjustmentType = (typeof CHECKOUT_ADJUSTMENT_TYPE)[number];

export const CHECKOUT_PAYMENT_METHOD = ["CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER"] as const;
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHOD)[number];

const AdjustmentSchema = new Schema(
    {
        type: { type: String, enum: CHECKOUT_ADJUSTMENT_TYPE, required: true },
        amount: { type: Number, required: true },
        label: { type: String, default: null },
    },
    { _id: false }
);

const CheckoutSessionSchema = new Schema(
    {
        hotelId: { type: Types.ObjectId, ref: "Hotel", required: true },
        roomSessionId: { type: Types.ObjectId, ref: "RoomSession", required: true },
        roomNumber: { type: String, required: true },

        foodOrderIds: [{ type: Types.ObjectId, ref: "FoodOrder" }],
        serviceRequestIds: [{ type: Types.ObjectId, ref: "ServiceRequest" }],

        /** Orders subtotal (sum of stored bill.toPay from orders + service requests) */
        ordersSubtotal: { type: Number, required: true },
        /** Total from adjustments: negative = discount, positive = charges */
        adjustmentsTotal: { type: Number, required: true },
        adjustments: [AdjustmentSchema],
        finalAmount: { type: Number, required: true },

        paymentMethod: { type: String, enum: CHECKOUT_PAYMENT_METHOD, required: true },
        paidAt: { type: Date, default: Date.now },
        checkedOutBy: { type: Types.ObjectId, ref: "User", required: true },

        /** Optional guest details for bill (from room session metadata or front desk input) */
        guestDetails: {
            name: { type: String, default: null },
            phone: { type: String, default: null },
        },
    },
    { timestamps: true }
);

CheckoutSessionSchema.index({ hotelId: 1, createdAt: -1 });
CheckoutSessionSchema.index({ roomSessionId: 1 });

const CheckoutSessionModel = model("CheckoutSession", CheckoutSessionSchema);
export default CheckoutSessionModel;
