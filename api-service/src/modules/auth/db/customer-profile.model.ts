import mongoose, { Schema, model } from "mongoose";

const customerSchema = new Schema({
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
    },
    foodPreferences: {
        type: [String],
    },
    profilePicture: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attachment",
    },
    isActive: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

customerSchema.index({ userId: 1 }, { unique: true });

const Customer = model("Customer", customerSchema);
export default Customer;