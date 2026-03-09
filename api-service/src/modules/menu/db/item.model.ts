// models/item.model.ts
import { Schema, model, Types } from "mongoose";
import { AvailabilitySchema } from "./availability.model.js";

const TaxEntrySchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 50 },
        rate: { type: Number, required: true, min: 0, max: 100 },
    },
    { _id: false }
);

const ItemSchema = new Schema(
    {
        hotelId: {
            type: Types.ObjectId,
            required: true,
            index: true
        },

        categoryId: {
            type: Types.ObjectId,
            ref: "Category",
            required: true,
            index: true
        },

        name: { type: String, required: true, trim: true },
        description: { type: String },
        image: {
            type: Types.ObjectId,
            ref: "Attachment",
        },

        shortCode: { type: String, required: true },
        sortOrder: { type: Number, default: 0 },

        type: {
            type: String,
            enum: ["veg", "non-veg", "egg"],
            required: true
        },

        preparationTimeMinutes: { type: Number, required: true },

        // Pricing
        price: { type: Number },                     // used if no variants
        discountedPrice: { type: Number },

        hasVariants: { type: Boolean, default: false },

        // Denormalized variant pricing
        minVariantPrice: { type: Number },
        maxVariantPrice: { type: Number },

        isPopular: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },

        availability: { type: AvailabilitySchema },

        taxes: [TaxEntrySchema],

        // Upsell override
        suggestedItemIds: [
            { type: Types.ObjectId, ref: "Item" }
        ]
    },
    { timestamps: true }
);

// Unique shortcode per hotel
ItemSchema.index({ hotelId: 1, shortCode: 1 }, { unique: true });

// Fast item listing per category
ItemSchema.index({ categoryId: 1, sortOrder: 1 });

export const ItemModel = model("Item", ItemSchema);
