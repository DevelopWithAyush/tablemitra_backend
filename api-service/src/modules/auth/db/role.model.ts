import { Schema, model } from "mongoose";

const roleSchema = new Schema({
    key: {
        type: String,
        required: true,
    },
    scope: {
        type: String,
        required: true,
        enum: ["GLOBAL", "CHAIN", "HOTEL"],
    },
    level: {
        type: Number,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

roleSchema.index({ key: 1 }, { unique: true });

const Role = model("Role", roleSchema);
export default Role;