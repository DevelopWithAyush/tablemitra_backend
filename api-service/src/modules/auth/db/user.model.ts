import { Schema, model } from "mongoose";

const userSchema = new Schema({
    phone: {
        type: String,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },

    //block logics
    isBlocked: {
        type: Boolean,
        default: false,
    },
    blockedAt: {
        type: Date,
        default: null,
    },
    blockedReason: {
        type: String,
        default: null,
    },
    //delete logics
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    deletedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    deletedReason: {
        type: String,
        default: null,
    },
}, { timestamps: true });

userSchema.index({ phone: 1 }, { unique: true });

const User = model("User", userSchema);
export default User;