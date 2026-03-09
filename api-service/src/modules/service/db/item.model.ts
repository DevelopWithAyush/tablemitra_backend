import { Schema, model, Types } from "mongoose";
import { AvailabilitySchema } from "./availability.model.js";

const TaxEntrySchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 50 },
        rate: { type: Number, required: true, min: 0, max: 100 },
    },
    { _id: false }
);

const ServiceItemSchema = new Schema(
    {
        hotelId: {
            type: Types.ObjectId,
            ref: "Hotel",
            required: true,
            index: true
        },

        categoryId: {
            type: Types.ObjectId,
            ref: "ServiceCategory",
            required: true,
            index: true
        },

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        description: {
            type: String,
            maxlength: 500
        },

        image: {
            type: Types.ObjectId,
            ref: "Attachment"
        },

        shortCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
            maxlength: 10
        },

        // Ordering within category
        sortOrder: {
            type: Number,
            default: 0
        },


        price: {
            type: Number,
            default: 0,
            min: 0
        },

        estimatedTimeMinutes: {
            type: Number,
            min: 1
        },

        isActive: {
            type: Boolean,
            default: true
        },

        availability: {
            type: AvailabilitySchema
        },

        taxes: [TaxEntrySchema],
    },
    { timestamps: true }
);

// Unique short code per hotel
ServiceItemSchema.index(
    { hotelId: 1, shortCode: 1 },
    { unique: true }
);

// Fast item listing per category (sorted)
ServiceItemSchema.index({ categoryId: 1, sortOrder: 1 });

// Active items per category (for customer view)
ServiceItemSchema.index({ categoryId: 1, isActive: 1, sortOrder: 1 });

// Active items per hotel (for full service listing)
ServiceItemSchema.index({ hotelId: 1, isActive: 1, sortOrder: 1 });

export const ServiceItemModel = model("ServiceItem", ServiceItemSchema);
