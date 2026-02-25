import { Schema, model, Types } from "mongoose";

// Aligned with qr-code.model: ROOM (roomNumber) | RESTAURANT | BAR (tableNumber)
export const FOOD_ORDER_CHANNEL = ["ROOM", "RESTAURANT", "BAR", "INTERNAL"] as const;
export type FoodOrderChannelType = (typeof FOOD_ORDER_CHANNEL)[number];

export const FOOD_ORDER_SOURCE = ["GUEST", "STAFF_FOR_GUEST", "STAFF"] as const;
export type FoodOrderSourceType = (typeof FOOD_ORDER_SOURCE)[number];

const FoodOrderItemSchema = new Schema(
    {
        itemId: { type: Types.ObjectId, ref: "Item", required: true },
        itemName: { type: String, required: true },
        price: { type: Number, required: true },
        discountedPrice: { type: Number },
        quantity: { type: Number, required: true },
        variantId: { type: Types.ObjectId, ref: "Variant" },
        variantName: { type: String },
        isUpsell: { type: Boolean, required: true, default: false },
    },
    { _id: false }
);

const FoodOrderSchema = new Schema(
    {
        hotelId: {
            type: Types.ObjectId,
            ref: "Hotel",
            required: true,
        },
        // Who placed the order (guest or staff) – always set
        placedById: {
            type: Types.ObjectId,
            ref: "User",
            required: true,
        },
        // Order source: guest self-order, staff for guest, or staff for staff
        source: {
            type: String,
            enum: FOOD_ORDER_SOURCE,
            required: true,
        },
        // Where the order is from: room, restaurant table, bar table, or internal (staff self, no seat)
        channelType: {
            type: String,
            enum: FOOD_ORDER_CHANNEL,
            required: true,
        },
        // Guest this order is for (when source is GUEST or STAFF_FOR_GUEST with a guest)
        customerId: {
            type: Types.ObjectId,
            ref: "User",
            default: null,
        },
        // When source is STAFF and order is for another staff member (optional)
        orderedForStaffId: {
            type: Types.ObjectId,
            ref: "User",
            default: null,
        },
        // ----- Room context (required when channelType === "ROOM") -----
        roomSessionId: {
            type: Types.ObjectId,
            ref: "RoomSession",
            default: null,
        },
        roomNumber: {
            type: String,
            default: null,
        },
        // ----- Table context (required when channelType === "RESTAURANT" or "BAR") -----
        tableNumber: {
            type: String,
            default: null,
        },
        zone: {
            type: String,
            default: null,
        },
        status: {
            type: String,
            enum: ["PENDING", "PREPARING", "SERVED", "REJECTED"],
            default: "PENDING",
        },
        items: [FoodOrderItemSchema],
        bill: {
            subtotal: { type: Number, required: true },
            serviceCharge: { type: Number, required: true },
            gstAndOther: { type: Number, required: true },
            toPay: { type: Number, required: true },
        },
        count: {
            type: Number,
            required: true,
        },
        paymentStatus: {
            type: String,
            enum: ["PENDING", "PAID", "REFUNDED"],
            default: "PENDING",
        },
        paidAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// Application layer must enforce: when channelType is ROOM provide roomSessionId + roomNumber;
// when channelType is RESTAURANT or BAR provide tableNumber (and optionally zone).

// Indexes
FoodOrderSchema.index({ hotelId: 1 });
FoodOrderSchema.index({ placedById: 1 });
FoodOrderSchema.index({ customerId: 1 });
FoodOrderSchema.index({ roomSessionId: 1 });
FoodOrderSchema.index({ status: 1 });
FoodOrderSchema.index({ createdAt: -1 });
FoodOrderSchema.index({ hotelId: 1, status: 1 });
FoodOrderSchema.index({ hotelId: 1, createdAt: -1 });
FoodOrderSchema.index({ customerId: 1, createdAt: -1 });
FoodOrderSchema.index({ roomSessionId: 1, createdAt: -1 });
FoodOrderSchema.index({ hotelId: 1, channelType: 1 });
FoodOrderSchema.index({ hotelId: 1, channelType: 1, tableNumber: 1 });
FoodOrderSchema.index({ hotelId: 1, source: 1 });

const FoodOrderModel = model("FoodOrder", FoodOrderSchema);

export default FoodOrderModel;
