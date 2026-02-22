import { Schema, model, Types } from "mongoose";

const ServiceRequestItemSchema = new Schema({
    itemId: {
        type: Types.ObjectId,
        ref: "Item",
        required: true,
    },
    itemName: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    discountedPrice: {
        type: Number,
    },
    quantity: {
        type: Number,
        required: true,
    },
})