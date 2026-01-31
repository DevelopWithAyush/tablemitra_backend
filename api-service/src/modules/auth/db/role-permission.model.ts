import { Schema, model } from "mongoose";

const rolePermissionSchema = new Schema({
    roleId: {
        type: Schema.Types.ObjectId,
        ref: "Role",
        required: true,
    },
    permissionId: {
        type: Schema.Types.ObjectId,
        ref: "Permission",
        required: true,
    },
}, { timestamps: true });

rolePermissionSchema.index({ roleId: 1, permissionId: 1 }, { unique: true });

const RolePermission = model("RolePermission", rolePermissionSchema);
export default RolePermission;