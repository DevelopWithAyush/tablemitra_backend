import mongoose from "mongoose";

const roomSessionSchema = new mongoose.Schema({
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hotel",
        required: true,
    },
    roomNumber: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ["ACTIVE", "CHECKED_OUT"],
        default: "ACTIVE",
    },
    checkInAt: {
        type: Date,
        default: Date.now,
    },
    checkedInBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
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
    stats: {
        totalOrders: { type: Number, default: 0 },
        totalFoodOrders: { type: Number, default: 0 },
        totalServiceRequests: { type: Number, default: 0 },
        totalSpend: { type: Number, default: 0 },
    },
    metadata: {
        guests: [{
            name: { type: String },
            phone: { type: String },
        }],
        guestCount: { type: Number, default: 0 },
        notes: { type: String },
    }
}, { timestamps: true });

roomSessionSchema.index({ roomNumber: 1, hotelId: 1 });
roomSessionSchema.index({ hotelId: 1, status: 1 });
roomSessionSchema.index({ hotelId: 1, roomNumber: 1, status: 1 });
roomSessionSchema.index({ checkInAt: -1 });
roomSessionSchema.index({ status: 1, checkOutAt: 1 });
roomSessionSchema.index({ hotelId: 1, status: 1, checkOutAt: 1 });

const RoomSession = mongoose.model("RoomSession", roomSessionSchema);
export default RoomSession;
