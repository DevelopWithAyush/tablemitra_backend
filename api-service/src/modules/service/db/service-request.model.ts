import mongoose from "mongoose";

const serviceRequestItemSchema = new mongoose.Schema({
    serviceItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ServiceItem",
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    serviceType: {
        type: String,
        enum: ["HOUSEKEEPING", "LAUNDRY", "MAINTENANCE", "AMENITY", "SPA", "POOL", "OTHER"],
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
    specialInstructions: {
        type: String,
    },
}, { _id: true });

const serviceRequestSchema = new mongoose.Schema({
    requestNumber: {
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
    items: [serviceRequestItemSchema],
    primaryServiceType: {
        type: String,
        enum: ["HOUSEKEEPING", "LAUNDRY", "MAINTENANCE", "AMENITY", "SPA", "POOL", "OTHER"],
        required: true,
    },
    status: {
        type: String,
        enum: ["PENDING", "ACCEPTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"],
        default: "PENDING",
    },
    priority: {
        type: String,
        enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
        default: "NORMAL",
    },
    assignedPanel: {
        type: String,
        enum: ["ROOM_SERVICE", "FRONTDESK"],
        default: "ROOM_SERVICE",
    },
    scheduledFor: {
        type: Date,
    },
    assignedStaffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    assignedAt: {
        type: Date,
    },
    acceptedAt: {
        type: Date,
    },
    acceptedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    startedAt: {
        type: Date,
    },
    completedAt: {
        type: Date,
    },
    completedBy: {
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
    guestNotes: {
        type: String,
    },
    staffNotes: {
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

serviceRequestSchema.index({ hotelId: 1, status: 1 });
serviceRequestSchema.index({ hotelId: 1, assignedPanel: 1, status: 1 });
serviceRequestSchema.index({ hotelId: 1, primaryServiceType: 1, status: 1 });
serviceRequestSchema.index({ guestSessionId: 1 });
serviceRequestSchema.index({ customerId: 1 });
serviceRequestSchema.index({ hotelId: 1, locationIdentifier: 1, status: 1 });
serviceRequestSchema.index({ assignedStaffId: 1, status: 1 });
serviceRequestSchema.index({ requestNumber: 1 }, { unique: true });
serviceRequestSchema.index({ createdAt: -1 });
serviceRequestSchema.index({ hotelId: 1, createdAt: -1 });
serviceRequestSchema.index({ scheduledFor: 1 });

const ServiceRequest = mongoose.model("ServiceRequest", serviceRequestSchema);
export default ServiceRequest;
