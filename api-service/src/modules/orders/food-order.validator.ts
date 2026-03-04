import { z } from "zod";

const mongoId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

const orderItemSchema = z.object({
    itemId: mongoId,
    itemName: z.string().min(1).max(200),
    price: z.number().positive(),
    discountedPrice: z.number().positive().optional(),
    quantity: z.number().int().positive(),
    variantId: mongoId.optional(),
    variantName: z.string().max(100).optional(),
    isUpsell: z.boolean().optional().default(false),
});

export const PlaceOrderValidation = z.object({
    body: z.object({
        items: z.array(orderItemSchema).min(1, "At least one item is required"),
        roomNumber: z.string().trim().min(1).max(20).optional(),
        forStaff: z.boolean().optional().default(false),
        cookingRequest: z.string().trim().max(500).optional(),
    }),
});

const orderStatusEnum = z.enum(["PENDING", "PREPARING", "SERVED", "REJECTED"]);

export const GetOrdersValidation = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        search: z.string().trim().max(100).optional(),
        /** Filter by order status. When omitted, all statuses returned, sorted PENDING → PREPARING → SERVED → REJECTED, then by createdAt desc. */
        status: orderStatusEnum.optional(),
    }),
});

export const UpdateOrderStatusValidation = z.object({
    params: z.object({ orderId: mongoId }),
    body: z.object({
        status: z.enum(["PREPARING", "SERVED", "REJECTED"]),
    }),
});

export type PlaceOrderBody = z.infer<typeof PlaceOrderValidation>["body"];
export type GetOrdersQuery = z.infer<typeof GetOrdersValidation>["query"];
export type UpdateOrderStatusBody = z.infer<typeof UpdateOrderStatusValidation>["body"];