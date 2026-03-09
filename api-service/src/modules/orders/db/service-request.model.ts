import { Schema, model, Types } from "mongoose";

export const SERVICE_REQUEST_STATUS = [
    "PENDING",
    "ACCEPTED",
    "IN_PROGRESS",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUS)[number];

const ServiceRequestItemSchema = new Schema(
    {
        itemId: { type: Types.ObjectId, ref: "ServiceItem", required: true },
        itemName: { type: String, required: true },
        categoryId: { type: Types.ObjectId, ref: "ServiceCategory", required: true },
        categoryName: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
    },
    { _id: false }
);

const ServiceRequestSchema = new Schema(
    {
        /** Guest who placed the request */
        userId: { type: Types.ObjectId, ref: "User", required: true },
        hotelId: { type: Types.ObjectId, ref: "Hotel", required: true },
        /** Always room-based — service requests require an active room session */
        roomSessionId: { type: Types.ObjectId, ref: "RoomSession", required: true },
        roomNumber: { type: String, required: true },

        items: { type: [ServiceRequestItemSchema], required: true },
        totalAmount: { type: Number, required: true, min: 0 },

        /** Bill breakdown: subtotal, no service charge, gstAndOther from item taxes, toPay. Optional for backward compatibility. */
        bill: {
            subtotal: { type: Number },
            serviceCharge: { type: Number },
            gstAndOther: { type: Number },
            toPay: { type: Number },
        },

        /** Optional free-text note from the guest (e.g. "collect after 3pm") */
        note: { type: String, default: null },

        status: {
            type: String,
            enum: SERVICE_REQUEST_STATUS,
            default: "PENDING",
        },

        paymentStatus: {
            type: String,
            enum: ["PENDING", "PAID", "REFUNDED"],
            default: "PENDING",
        },
        paidAt: { type: Date, default: null },

        // ── Status timestamps for analytics ──────────────────────────────
        acceptedAt: { type: Date, default: null },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        rejectedAt: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },
    },
    { timestamps: true }
);

ServiceRequestSchema.index({ hotelId: 1 });
ServiceRequestSchema.index({ userId: 1 });
ServiceRequestSchema.index({ roomSessionId: 1 });
ServiceRequestSchema.index({ hotelId: 1, status: 1 });
ServiceRequestSchema.index({ hotelId: 1, createdAt: -1 });
ServiceRequestSchema.index({ userId: 1, createdAt: -1 });
ServiceRequestSchema.index({ status: 1 });
ServiceRequestSchema.index({ createdAt: -1 });

const ServiceRequestModel = model("ServiceRequest", ServiceRequestSchema);
export default ServiceRequestModel;
