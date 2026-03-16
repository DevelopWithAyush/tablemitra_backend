import { z } from "zod";

const MongoIdSchema = z.string().length(24, "Invalid ID format");

const AdjustmentSchema = z.object({
    type: z.enum(["DISCOUNT", "DAMAGE", "OTHER"]),
    amount: z.number().min(0),
    label: z.string().max(200).optional(),
});

export const GetCheckoutPreviewSchema = z
    .object({
        query: z.object({
            roomSessionId: MongoIdSchema.optional(),
            checkoutSessionId: MongoIdSchema.optional(),
        }),
    })
    .refine((data) => !!(data.query.roomSessionId || data.query.checkoutSessionId), {
        message: "Either roomSessionId or checkoutSessionId is required",
        path: ["query"],
    })
    .refine(
        (data) => !(data.query.roomSessionId && data.query.checkoutSessionId),
        { message: "Provide only one of roomSessionId or checkoutSessionId", path: ["query"] }
    );

export const ProceedCheckoutSchema = z.object({
    body: z.object({
        roomSessionId: MongoIdSchema,
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

export const GetCheckoutHistorySchema = z.object({
    query: z.object({
        search: z.string().max(200).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
});

export const GetCheckoutBillPdfSchema = z.object({
    query: z.object({
        roomSessionId: MongoIdSchema,
    }),
});
