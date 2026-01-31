import { Schema, model } from "mongoose";

const sessionSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    app: {
        type: String,
        required: true,
        enum: ['founder', 'manager', 'frontdesk', 'admin', 'customer-care', 'customer', 'kitchen', 'room-service','sales'],
        index: true
    },
    refreshToken: {
        type: String,
        required: true,
        index: true,
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
}, { timestamps: true });

sessionSchema.index({ userId: 1, app: 1, refreshToken: 1, isActive: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = model("Session", sessionSchema);
export default Session;
