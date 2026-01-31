import { Schema, model } from "mongoose";

/**
 * HotelStaff - Staff profile for hotel employees
 * Includes: Manager, Frontdesk, Kitchen, Room Service, Housekeeping
 * 
 * NOTE: isDeleted/isBlocked are handled in UserRole model, not here.
 * Profile only has isActive for temporary deactivation.
 * 
 * When staff leaves hotel:
 * 1. Update currentHotelId to new hotel (or null)
 * 2. Mark old UserRole as isDeleted with reason "Left the hotel"
 * 3. Create new UserRole for new hotel context
 */
const hotelStaffSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        sparse: true,
    },
    isEmailVerified: {
        type: Boolean,
        default: false,
    },
    profilePicture: {
        type: Schema.Types.ObjectId,
        ref: "Attachment",
    },
    employeeCode: {
        type: String,
        required: true,
        unique: true,
    },
    designation: {
        type: String,
        enum: ["MANAGER", "FRONTDESK", "KITCHEN", "ROOM_SERVICE", "HOUSEKEEPING"],
        required: true,
    },
    currentHotelId: {
        type: Schema.Types.ObjectId,
        ref: "Hotel",
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    joinedAt: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });

hotelStaffSchema.index({ userId: 1 }, { unique: true });
hotelStaffSchema.index({ employeeCode: 1 }, { unique: true });
hotelStaffSchema.index({ currentHotelId: 1, designation: 1 });
hotelStaffSchema.index({ currentHotelId: 1, isActive: 1 });
hotelStaffSchema.index({ phone: 1 });

const HotelStaff = model("HotelStaff", hotelStaffSchema);
export default HotelStaff;
