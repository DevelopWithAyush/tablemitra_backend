// models/subschemas/availability.schema.ts
import { Schema } from "mongoose";

export const AvailabilitySchema = new Schema(
    {
        days: [{ type: Number, min: 0, max: 6 }],   // 0 = Sunday
        startTime: { type: String },                // "09:00"
        endTime: { type: String }                   // "23:30"
    },
    { _id: false }
);
