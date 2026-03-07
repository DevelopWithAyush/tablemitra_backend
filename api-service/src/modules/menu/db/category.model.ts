// models/category.model.ts
import { Schema, model, Types } from "mongoose";
import { AvailabilitySchema } from "./availability.model.js";

const CategorySchema = new Schema(
    {
        hotelId: {
            type: Types.ObjectId,
            required: true,
            index: true
        },

        name: { type: String, required: true, trim: true },
        description: { type: String },
        image: {
            type: Types.ObjectId,
            ref: "Attachment",
        },

        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },

        availability: { type: AvailabilitySchema },

        // Upsell system
        suggestedCategoryIds: [
            { type: Types.ObjectId, ref: "Category" }
        ]
    },
    { timestamps: true }
);

// Fast category listing per hotel
CategorySchema.index({ hotelId: 1, sortOrder: 1 });

// Prevent duplicate category names within the same hotel (case-sensitive safety net;
// the service layer also enforces case-insensitive uniqueness via escaped regex pre-check)
CategorySchema.index({ hotelId: 1, name: 1 }, { unique: true });

export const CategoryModel = model("Category", CategorySchema);
