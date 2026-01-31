import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    name: {
        type: String,
    },
    email: {
        type: String,
        unique: true,
    },
    isEmailVerified: {
        type: Boolean,
        default: false,
    },
    profilePicture: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attachment",
    },
    isActive: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

adminSchema.index({ userId: 1 }, { unique: true });

const Admin = mongoose.model("Admin", adminSchema);
export default Admin;   