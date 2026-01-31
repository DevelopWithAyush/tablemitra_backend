import { Schema, model } from "mongoose";

/**
 * ChainMembership - Junction table for Founder-Chain many-to-many relationship
 * A Founder can be part of multiple chains with different roles
 * A Chain can have multiple founders/owners
 */
const chainMembershipSchema = new Schema({
    founderId: {
        type: Schema.Types.ObjectId,
        ref: "Founder",
        required: true,
    },
    chainId: {
        type: Schema.Types.ObjectId,
        ref: "Chain",
        required: true,
    },
    role: {
        type: String,
        enum: ["OWNER", "CO_OWNER", "DIRECTOR", "PARTNER"],
        required: true,
        default: "OWNER",
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    joinedAt: {
        type: Date,
        default: Date.now,
    },
    leftAt: {
        type: Date,
        default: null,
    },
    invitedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },

    // Soft delete
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

// Unique: One founder can have only one membership per chain
chainMembershipSchema.index({ founderId: 1, chainId: 1 }, { unique: true });
// Query: All active memberships of a founder
chainMembershipSchema.index({ founderId: 1, isActive: 1, isDeleted: 1 });
// Query: All founders/members of a chain
chainMembershipSchema.index({ chainId: 1, isActive: 1, isDeleted: 1 });
// Query: By role in a chain
chainMembershipSchema.index({ chainId: 1, role: 1, isActive: 1 });

const ChainMembership = model("ChainMembership", chainMembershipSchema);
export default ChainMembership;
