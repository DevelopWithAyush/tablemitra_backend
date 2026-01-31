import { Schema, model } from "mongoose";

const qrCodeSchema = new Schema({
    qrSetId: {
        type: Schema.Types.ObjectId,
        ref: "QrSet",
        required: true,
    },
    code: {
        type: String,
        required: true,
        unique: true,
    },
    type: {
        type: String,
        enum: ["ROOM", "RESTAURANT", "BAR"],
        default: "ROOM",
        required: true,
    },
    floor: {
        type: String, 
        required: function (this: any) { return this.type === "ROOM"; }
    },
    roomNumber: {
        type: String,
        required: function (this: any) { return this.type === "ROOM"; }
    },
    zone: {
        type: String,
    },
    tableNumber: {
        type: String,
        required: function (this: any) { return ["RESTAURANT", "BAR"].includes(this.type); }
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




qrCodeSchema.index(
    { qrSetId: 1, roomNumber: 1 },
    {
        unique: true,
        partialFilterExpression: { type: "ROOM", roomNumber: { $exists: true } }
    }
);


qrCodeSchema.index(
    { qrSetId: 1, zone: 1, tableNumber: 1 },
    {
        unique: true,
        partialFilterExpression: {
            type: { $in: ["RESTAURANT", "BAR"] },
            zone: { $exists: true },
            tableNumber: { $exists: true }
        }
    }
);


qrCodeSchema.index({ qrSetId: 1, status: 1, isActive: 1 });

const QrCode = model("QrCode", qrCodeSchema);
export default QrCode;
