import mongoose from "mongoose";

const guestSessionSchema = new mongoose.Schema({
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
    bookingRef: {
        type: String,
    },
    status: {
        type: String,
        enum: ["ACTIVE", "COMPLETED", "TRANSFERRED"],
        default: "ACTIVE",
    },
    checkInAt: {
        type: Date,
        default: Date.now,
    },
    checkOutAt: {
        type: Date,
        default: null,
    },
    checkedOutBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    previousSessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GuestSession",
        default: null,
    },
    stats: {
        totalOrders: { type: Number, default: 0 },
        totalFoodOrders: { type: Number, default: 0 },
        totalServiceRequests: { type: Number, default: 0 },
        totalSpend: { type: Number, default: 0 },
    },
}, { timestamps: true });

guestSessionSchema.index({ customerId: 1, hotelId: 1 });
guestSessionSchema.index({ hotelId: 1, status: 1 });
guestSessionSchema.index({ hotelId: 1, locationIdentifier: 1, status: 1 });
guestSessionSchema.index({ checkInAt: -1 });
guestSessionSchema.index({ status: 1, checkOutAt: 1 });

const GuestSession = mongoose.model("GuestSession", guestSessionSchema);
export default GuestSession;
