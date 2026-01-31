import { Schema, model, Types } from "mongoose";
import { AvailabilitySchema } from "./availability.model.js";



const ServiceCategorySchema = new Schema(
    {
        hotelId: {
            type: Types.ObjectId,
            ref: "Hotel",
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

        sortOrder: {
            type: Number,
            default: 0
        },

        isActive: {
            type: Boolean,
            default: true
        },

        availability: {
            type: AvailabilitySchema
        },

    },
    { timestamps: true }
);


ServiceCategorySchema.index({ hotelId: 1, sortOrder: 1 });

// Active categories only
ServiceCategorySchema.index({ hotelId: 1, isActive: 1, sortOrder: 1 });

// Unique name per hotel (case-insensitive)
ServiceCategorySchema.index(
    { hotelId: 1, name: 1 },
    { unique: true, collation: { locale: "en", strength: 2 } }
);

export const ServiceCategoryModel = model("ServiceCategory", ServiceCategorySchema);
