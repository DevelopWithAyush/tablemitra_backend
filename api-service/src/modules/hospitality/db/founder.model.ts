import { Schema, model } from "mongoose";

/**
 * Founder - Hotel business owner profile
 * Chain associations are managed via ChainMembership junction table
 * 
 * NOTE: isDeleted/isBlocked are handled in UserRole model, not here.
 * Profile only has isActive for temporary deactivation.
 * When a founder is blocked/deleted, update UserRole with reason.
 */
const founderSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    name: {
        type: String,
    },
    email: {
        type: String,
        unique: true,
        sparse: true,
    },
    isEmailVerified: {
        type: Boolean,
        default: false,
    },
    phone: {
        type: String,
    },
    profilePicture: {
        type: Schema.Types.ObjectId,
        ref: "Attachment",
    },
    designation: {
        type: String,
    },
    // Chains are now managed via ChainMembership model (junction table)
    // This allows proper many-to-many: Founder <-> Chain

    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

founderSchema.index({ userId: 1 }, { unique: true });
founderSchema.index({ email: 1 }, { sparse: true });
founderSchema.index({ phone: 1 });
founderSchema.index({ isActive: 1 });

const Founder = model("Founder", founderSchema);
export default Founder;
