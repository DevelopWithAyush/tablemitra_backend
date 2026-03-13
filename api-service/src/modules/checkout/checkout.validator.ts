import { z } from "zod";

const MongoIdSchema = z.string().length(24, "Invalid ID format");

const AdjustmentSchema = z.object({
    type: z.enum(["DISCOUNT", "DAMAGE", "OTHER"]),
    amount: z.number().min(0),
    label: z.string().max(200).optional(),
});

export const GetCheckoutPreviewSchema = z.object({
    query: z.object({
        roomSessionId: MongoIdSchema,
    }),
});

export const ProceedCheckoutSchema = z.object({
    body: z.object({
        hotelId: MongoIdSchema,
        roomNumber: z.string().min(1).max(50),
        adjustments: z.array(AdjustmentSchema).default([]),
        paymentMethod: z.enum(["CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER"]),
        guestDetails: z
            .object({
                name: z.string().max(200).optional(),
                phone: z.string().max(20).optional(),
            })
            .optional(),
    }),
});

export const GetCheckoutBillPdfSchema = z.object({
    params: z.object({
        checkoutSessionId: MongoIdSchema,
    }),
});
