import { z } from "zod";

// ==================== BASE SCHEMAS ====================

const mongoIdRegex = /^[0-9a-fA-F]{24}$/;
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM format

// Common fields
const MongoIdField = z.string().regex(mongoIdRegex, "Invalid ID format");
const NameField = z.string().min(1, "Name is required").max(100, "Name must not exceed 100 characters").trim();
const DescriptionField = z.string().max(500, "Description must not exceed 500 characters").optional();
const ShortCodeField = z.string().min(1, "Short code is required").max(10, "Short code must not exceed 10 characters").toUpperCase();
const SortOrderField = z.number().int().min(0).default(0);
const PriceField = z.number().min(0, "Price must be non-negative");

// ==================== AVAILABILITY SCHEMA ====================

export const AvailabilitySchema = z.object({
    days: z.array(z.number().int().min(0).max(6)).min(1, "At least one day must be selected"),
    startTime: z.string().regex(timeRegex, "Invalid time format (HH:MM)").optional(),
    endTime: z.string().regex(timeRegex, "Invalid time format (HH:MM)").optional(),
}).refine(
    (data) => {
        if (data.startTime && data.endTime) {
            return data.startTime < data.endTime;
        }
        return true;
    },
    { message: "Start time must be before end time" }
);

// ==================== CATEGORY SCHEMAS ====================

export const CreateCategorySchema = z.object({
    name: NameField,
    description: DescriptionField,
    image: MongoIdField.optional(),
    sortOrder: SortOrderField,
    availability: AvailabilitySchema.optional(),
});

export const UpdateCategorySchema = z.object({
    name: NameField.optional(),
    description: DescriptionField,
    image: MongoIdField.nullable().optional(),
    sortOrder: SortOrderField.optional(),
    isActive: z.boolean().optional(),
    availability: AvailabilitySchema.nullable().optional(),
});

// ==================== SERVICE SCHEMAS ====================

export const CreateServiceSchema = z.object({
    name: NameField,
    description: DescriptionField,
    image: MongoIdField.optional(),
    shortCode: ShortCodeField,
    sortOrder: SortOrderField,
    price: PriceField.default(0),
    estimatedTimeMinutes: z.number().int().min(1, "Estimated time must be at least 1 minute").optional(),
    availability: AvailabilitySchema.optional(),
});

export const UpdateServiceSchema = z.object({
    name: NameField.optional(),
    description: DescriptionField,
    image: MongoIdField.nullable().optional(),
    shortCode: ShortCodeField.optional(),
    sortOrder: SortOrderField.optional(),
    price: PriceField.optional(),
    estimatedTimeMinutes: z.number().int().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
    availability: AvailabilitySchema.nullable().optional(),
});

// ==================== PAGINATION SCHEMA ====================

// Query params are strings; "false" must map to boolean false (z.coerce.boolean() treats "false" as true)
const isActiveQuerySchema = z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === true || val === "true"));

export const PaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    isActive: isActiveQuerySchema,
});

// ==================== ROUTE VALIDATION SCHEMAS ====================

// Param schemas
const CategoryIdParam = z.object({
    categoryId: MongoIdField,
});

const ServiceIdParam = z.object({
    serviceId: MongoIdField,
});

// Category validations
export const GetCategoriesValidation = z.object({
    query: PaginationSchema,
});

export const CreateCategoryValidation = z.object({
    body: CreateCategorySchema,
});

export const UpdateCategoryValidation = z.object({
    params: CategoryIdParam.passthrough(),
    body: UpdateCategorySchema,
});

export const ToggleCategoryValidation = z.object({
    params: CategoryIdParam.passthrough(),
});

// Service validations
export const GetServicesValidation = z.object({
    params: CategoryIdParam.passthrough(),
    query: PaginationSchema,
});

export const CreateServiceValidation = z.object({
    params: CategoryIdParam.passthrough(),
    body: CreateServiceSchema,
});

export const UpdateServiceValidation = z.object({
    params: ServiceIdParam.passthrough(),
    body: UpdateServiceSchema,
});

export const ToggleServiceValidation = z.object({
    params: ServiceIdParam.passthrough(),
});

// Full catalog
export const GetFullCatalogValidation = z.object({
    query: z.object({
        includeInactive: z.coerce.boolean().default(false),
    }),
});

// ==================== AUTO-GENERATED DTO TYPES ====================

export type AvailabilityDTO = z.infer<typeof AvailabilitySchema>;
export type CreateCategoryDTO = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryDTO = z.infer<typeof UpdateCategorySchema>;
export type CreateServiceDTO = z.infer<typeof CreateServiceSchema>;
export type UpdateServiceDTO = z.infer<typeof UpdateServiceSchema>;
export type PaginationDTO = z.infer<typeof PaginationSchema>;
