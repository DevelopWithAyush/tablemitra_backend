import mongoose from "mongoose";

const foodOrderItemSchema = new mongoose.Schema({
    menuItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItem",
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    price: {
        type: Number,
        required: true,
    },
    totalPrice: {
        type: Number,
        required: true,
    },
    modifiers: [{
        type: String,
    }],
    courseType: {
        type: String,
        enum: ["STARTER", "MAIN", "DESSERT", "BEVERAGE", "SIDE"],
    },
    specialInstructions: {
        type: String,
    },
}, { _id: true });

const foodOrderSchema = new mongoose.Schema({
    orderNumber: {
        type: String,
        required: true,
    },
    guestSessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GuestSession",
        required: true,
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hotel",
        required: true,
    },
    locationType: {
        type: String,
        enum: ["ROOM", "TABLE", "POOL", "SPA", "LOBBY", "OTHER"],
        required: true,
    },
    locationIdentifier: {
        type: String,
        required: true,
    },
    items: [foodOrderItemSchema],
    status: {
        type: String,
        enum: ["PENDING", "ACCEPTED", "PREPARING", "READY", "SERVED", "REJECTED", "CANCELLED"],
        default: "PENDING",
    },
    assignedPanel: {
        type: String,
        enum: ["KITCHEN", "FRONTDESK", "ROOM_SERVICE"],
        default: "KITCHEN",
    },
    estimatedPrepTime: {
        type: Number,
    },
    acceptedAt: {
        type: Date,
    },
    acceptedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    preparingAt: {
        type: Date,
    },
    readyAt: {
        type: Date,
    },
    servedAt: {
        type: Date,
    },
    servedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    rejectedAt: {
        type: Date,
    },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    rejectionReason: {
        type: String,
    },
    cancelledAt: {
        type: Date,
    },
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    cancellationReason: {
        type: String,
    },
    subtotal: {
        type: Number,
        required: true,
    },
    tax: {
        type: Number,
        default: 0,
    },
    discount: {
        type: Number,
        default: 0,
    },
    totalAmount: {
        type: Number,
        required: true,
    },
    specialInstructions: {
        type: String,
    },
    paymentStatus: {
        type: String,
        enum: ["PENDING", "PAID", "REFUNDED"],
        default: "PENDING",
    },
    paymentMethod: {
        type: String,
        enum: ["CASH", "CARD", "UPI", "ROOM_CHARGE", "WALLET"],
    },
    paidAt: {
        type: Date,
    },
}, { timestamps: true });

foodOrderSchema.index({ hotelId: 1, status: 1 });
foodOrderSchema.index({ hotelId: 1, assignedPanel: 1, status: 1 });
foodOrderSchema.index({ guestSessionId: 1 });
foodOrderSchema.index({ customerId: 1 });
foodOrderSchema.index({ hotelId: 1, locationIdentifier: 1, status: 1 });
foodOrderSchema.index({ orderNumber: 1 }, { unique: true });
foodOrderSchema.index({ createdAt: -1 });
foodOrderSchema.index({ hotelId: 1, createdAt: -1 });

const FoodOrder = mongoose.model("FoodOrder", foodOrderSchema);
export default FoodOrder;
