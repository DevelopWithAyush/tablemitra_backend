import mongoose from "mongoose";

const customerCareSchema = new mongoose.Schema({
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
    designation: {
        type: String,
        required: true,
        enum: ["CUSTOMER_CARE", "CUSTOMER_CARE_LEAD", "CUSTOMER_CARE_MANAGER"],
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

customerCareSchema.index({ userId: 1 }, { unique: true });

const CustomerCare = mongoose.model("CustomerCare", customerCareSchema);
export default CustomerCare;