import mongoose from "mongoose";

const salesProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    employeeCode: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
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
    },
}, { timestamps: true });

salesProfileSchema.index({ userId: 1 }, { unique: true });

const SalesProfile = mongoose.model("SalesProfile", salesProfileSchema);
export default SalesProfile;