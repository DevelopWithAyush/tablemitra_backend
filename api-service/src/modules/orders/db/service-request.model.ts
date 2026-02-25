import { Schema, model, Types } from "mongoose";

const ServiceRequestItemSchema = new Schema({
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
})

const ServiceRequestSchema = new Schema({
    userId: {
        type: Types.ObjectId,
        ref: "User",
        required: true,
    },
    hotelId: {
        type: Types.ObjectId,
        ref: "Hotel",
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
    items: [ServiceRequestItemSchema],
    totalAmount: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ["PENDING", "REQUEST_REGISTERED", "COMPLETED ", "CLOTH_COLLECTED", "CANCELLED"],
        default: "PENDING",
    },
    paymentStatus: {
        type: String,
        enum: ["PENDING", "PAID", "REFUNDED"],
        default: "PENDING",
    },
    paidAt: {
        type: Date,
    },
}, { timestamps: true });

const ServiceRequest = model("ServiceRequest", ServiceRequestSchema);
export default ServiceRequest;