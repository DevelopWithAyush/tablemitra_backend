import mongoose from "mongoose";

const hotelSchema = new mongoose.Schema({
    chainId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Chain",
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    slug: {
        type: String,
        required: true,
    },
    logo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attachment",
    },
    description: {
        type: String,
    },
    address: {
        street: { type: String },
        city: { type: String, required: true },
        state: { type: String, required: true },
        country: { type: String, default: "India" },
        pincode: { type: String, required: true },
        coordinates: {
            lat: { type: Number },
            lng: { type: Number },
        },
    },
    contact: {
        phone: { type: String, required: true },
        email: { type: String, required: true },
        website: { type: String },
    },
    settings: {
        currency: { type: String, default: "INR" },
        timezone: { type: String, default: "Asia/Kolkata" },
        checkInTime: { type: String, default: "14:00" },
        checkOutTime: { type: String, default: "11:00" },
    },
    panelSettings: {
        kitchenEnabled: { type: Boolean, default: true },
        roomServiceEnabled: { type: Boolean, default: true },
        kitchenOfflineRedirect: {
            type: String,
            enum: ["FRONTDESK", "ROOM_SERVICE"],
            default: "FRONTDESK",
        },
    },
    totalRooms: {
        type: Number,
        default: 0,
    },
    amenities: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Amenity",
    }],
    images: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attachment",
    }],
    rating: {
        average: { type: Number, default: 0 },
        count: { type: Number, default: 0 },
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
}, { timestamps: true });

hotelSchema.index({ chainId: 1 });
hotelSchema.index({ slug: 1 }, { unique: true });
hotelSchema.index({ "address.city": 1, "address.state": 1 });
hotelSchema.index({ isActive: 1, isDeleted: 1 });
hotelSchema.index({ name: "text", "address.city": "text" });

const Hotel = mongoose.model("Hotel", hotelSchema);
export default Hotel;
