import { Schema, model } from "mongoose";

/**
 * Chain - Hotel brand/group (e.g., "Taj Hotels", "Marriott")
 * Founder associations are managed via ChainMembership junction table
 */
const chainSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    // Founders/owners are now managed via ChainMembership model (junction table)
    // This allows proper many-to-many: Founder <-> Chain

    createdBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    logo: {
        type: Schema.Types.ObjectId,
        ref: "Attachment",
    },
    description: {
        type: String,
    },
    settings: {
        currency: {
            type: String,
            default: "INR",
        },
        timezone: {
            type: String,
            default: "Asia/Kolkata",
        },
        supportEmail: {
            type: String,
        },
        supportPhone: {
            type: String,
        },
        brandingColors: {
            primary: { type: String },
            secondary: { type: String },
            accent: { type: String },
        },
    },
    subscription: {
        plan: {
            type: String,
            enum: ["STARTER", "GROWTH", "ENTERPRISE"],
            default: "STARTER",
        },
        validTill: {
            type: Date,
        },
        features: [{
            type: String,
        }],
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
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
}, { timestamps: true });

chainSchema.index({ name: 1 }, { unique: true });
chainSchema.index({ createdBy: 1 });
chainSchema.index({ isActive: 1, isDeleted: 1 });

const Chain = model("Chain", chainSchema);
export default Chain;
