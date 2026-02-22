import { Schema, model, Types } from "mongoose";

const FoodOrderItemSchema = new Schema({
    itemId: {
        type: Types.ObjectId,
        ref: "Item",
        required: true,
    },
    itemName: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    discountedPrice: {
        type: Number,
    },
    quantity: {
        type: Number,
        required: true,
    },
    variantId: {
        type: Types.ObjectId,
        ref: "Variant",
    },
    variantName: {
        type: String,
    },
    isUpsell: {
        type: Boolean,
        required: true,
        default: false,
    },
}, { _id: false });

const FoodOrderSchema = new Schema({
    hotelId: {
        type: Types.ObjectId,
        ref: "Hotel",
        required: true,
    },
    customerId: {
        type: Types.ObjectId,
        ref: "User",
        required: true,
    },
    roomSessionId: {
        type: Types.ObjectId,
        ref: "RoomSession",
        required: true,
    },
    roomNumber: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ["PENDING", "PREPARING", "SERVED", "REJECTED"],
        default: "PENDING",
    },
    items: [FoodOrderItemSchema],
    bill: {
        subtotal: {
            type: Number,
            required: true,
        },
        serviceCharge: {
            type: Number,
            required: true,
        },
        gstAndOther: {
            type: Number,
            required: true,
        },
        toPay: {
            type: Number,
            required: true,
        },
    },
    count: {
        type: Number,
        required: true,
    },
}, { timestamps: true });

// Indexes for efficient querying
FoodOrderSchema.index({ hotelId: 1 });
FoodOrderSchema.index({ customerId: 1 });
FoodOrderSchema.index({ roomSessionId: 1 });
FoodOrderSchema.index({ status: 1 });
FoodOrderSchema.index({ createdAt: -1 });
FoodOrderSchema.index({ hotelId: 1, status: 1 });
FoodOrderSchema.index({ hotelId: 1, createdAt: -1 });
FoodOrderSchema.index({ customerId: 1, createdAt: -1 });
FoodOrderSchema.index({ roomSessionId: 1, createdAt: -1 });

const FoodOrderModel = model("FoodOrder", FoodOrderSchema);

export default FoodOrderModel;