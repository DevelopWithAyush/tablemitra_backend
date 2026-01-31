// models/variant.model.ts
import { Schema, model, Types } from "mongoose";

const VariantSchema = new Schema(
    {
        hotelId: {
            type: Types.ObjectId,
            required: true,
            index: true
        },

        itemId: {
            type: Types.ObjectId,
            ref: "Item",
            required: true,
            index: true
        },

        name: { type: String, required: true },   // Half / Full / Small

        shortCode: { type: String, required: true },

        price: { type: Number, required: true },
        discountedPrice: { type: Number },

        preparationTimeMinutes: { type: Number },

        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 }
    },
    { timestamps: true }
);

// Unique variant code per item
VariantSchema.index({ itemId: 1, shortCode: 1 }, { unique: true });

// Fast variant fetch per item
VariantSchema.index({ itemId: 1, sortOrder: 1 });

export const VariantModel = model("Variant", VariantSchema);
