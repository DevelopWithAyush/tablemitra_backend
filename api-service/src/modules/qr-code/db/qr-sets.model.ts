import { Schema, model } from "mongoose";

/**
 * QrSet - One QR Set per Hotel
 * Created automatically when a hotel is onboarded
 * Contains all QR codes for rooms in that hotel
 */
const qrSetSchema = new Schema({
    hotelId: {
        type: Schema.Types.ObjectId,
        ref: "Hotel",
        required: true,
    },
    status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE"],
        default: "ACTIVE",
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    reasonOfDeactivation: {
        type: String,
        default: null,
    },
    deactivatedAt: {
        type: Date,
        default: null,
    },
    deactivatedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
}, { timestamps: true });

// One QR Set per Hotel
qrSetSchema.index({ hotelId: 1 }, { unique: true });
qrSetSchema.index({ status: 1, isActive: 1 });

const QrSet = model("QrSet", qrSetSchema);
export default QrSet;
