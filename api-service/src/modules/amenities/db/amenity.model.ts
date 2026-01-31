import mongoose from "mongoose";

const amenitySchema = new mongoose.Schema({
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AmenityCategory",
        required: true,
    },
    name: {
        type: String,
        required: true,
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
    amenityType: {
        type: String,
        enum: ["ROOM", "HOTEL", "BOTH"],
        default: "BOTH",
    },
    isPaid: {
        type: Boolean,
        default: false,
    },
    price: {
        type: Number,
        default: 0,
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

amenitySchema.index({ categoryId: 1 });
amenitySchema.index({ amenityType: 1 });
amenitySchema.index({ isActive: 1 });
amenitySchema.index({ name: "text", description: "text" });

const Amenity = mongoose.model("Amenity", amenitySchema);
export default Amenity;
