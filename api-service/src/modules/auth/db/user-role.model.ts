import { Schema, model } from "mongoose";

const userRoleSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    roleId: {
        type: Schema.Types.ObjectId,
        ref: "Role",
        required: true,
    },
    contextType: {
        type: String,
        required: true,
        enum: ["GLOBAL", "CHAIN", "HOTEL"],
    },
    contextId: {
        type: Schema.Types.ObjectId,
        default: null,
    },
    isActive: {
        type: Boolean,
        default: true,
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
}, { timestamps: true });

userRoleSchema.index({ userId: 1, roleId: 1, contextType: 1, contextId: 1 }, { unique: true });

const UserRole = model("UserRole", userRoleSchema);
export default UserRole;