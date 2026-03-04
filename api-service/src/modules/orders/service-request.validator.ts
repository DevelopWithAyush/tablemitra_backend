import { z } from "zod";

const mongoId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

// Only itemId + quantity from the client — name, category, and price are
// resolved from the DB on the backend to prevent price manipulation.
const serviceRequestItemSchema = z.object({
    itemId: mongoId,
    quantity: z.number().int().positive(),
});

export const PlaceServiceRequestValidation = z.object({
    body: z.object({
        items: z.array(serviceRequestItemSchema).min(1, "At least one item is required"),
        roomNumber: z.string().trim().min(1).max(20).optional(),
        note: z.string().trim().max(500).optional(),
    }),
});

const serviceRequestStatusEnum = z.enum([
    "PENDING",
    "ACCEPTED",
    "IN_PROGRESS",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
]);

export const GetServiceRequestsValidation = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        search: z.string().trim().max(100).optional(),
        status: serviceRequestStatusEnum.optional(),
    }),
});

export const UpdateServiceRequestStatusValidation = z.object({
    params: z.object({ requestId: mongoId }),
    body: z.object({
        status: z.enum(["ACCEPTED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"]),
    }),
});

export type PlaceServiceRequestBody = z.infer<typeof PlaceServiceRequestValidation>["body"];
export type GetServiceRequestsQuery = z.infer<typeof GetServiceRequestsValidation>["query"];
export type UpdateServiceRequestStatusBody = z.infer<typeof UpdateServiceRequestStatusValidation>["body"];
