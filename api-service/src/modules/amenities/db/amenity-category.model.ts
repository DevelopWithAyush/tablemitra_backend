import mongoose from "mongoose";

const amenityCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    description: {
        type: String,
    },
    icon: {
        type: String,
    },
    image: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attachment",
    },
    sortOrder: {
        type: Number,
        default: 0,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

amenityCategorySchema.index({ name: 1 });
amenityCategorySchema.index({ isActive: 1 });
amenityCategorySchema.index({ sortOrder: 1 });

const AmenityCategory = mongoose.model("AmenityCategory", amenityCategorySchema);
export default AmenityCategory;
