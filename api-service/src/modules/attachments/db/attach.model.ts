import mongoose, { Types } from "mongoose";

const attachmentSchema = new mongoose.Schema({
    fileName: {
        type: String,
        required: true,
    },
    fileType: {
        type: String,
        required: true,
    },
    fileSize: {
        type: Number,
        required: true,
    },
    storageKey: {
        type: String,
        required: true,
    },
    bucket: {
        type: String,
        required: true,
    },
    url: {
        type: String,
        required: true,
    },
    uploadedBy: {
        type: Types.ObjectId,
        ref: "User",
        required: true,
    },
    status: {
        type: String,
        enum: ["pending", "active", "inactive", "deleted"],
        default: "pending",
    },
    expiresAt: {
        type: Date,
        required: false,
        index: true, // Index for efficient querying in cleanup job
    },
}, { timestamps: true });

const Attachment = mongoose.model("Attachment", attachmentSchema);
export default Attachment;