import { Schema, model } from "mongoose";

const permissionSchema = new Schema({
    key: {
        type: String,
        required: true,
        unique: true,
    },
    description: {
        type: String,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

permissionSchema.index({ key: 1 }, { unique: true });

const Permission = model("Permission", permissionSchema);
export default Permission;