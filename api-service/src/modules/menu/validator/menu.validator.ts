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
const PriceField = z.number().positive("Price must be positive");

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

// ==================== VARIANT SCHEMA ====================

export const VariantSchema = z.object({
    name: NameField,
    shortCode: ShortCodeField,
    price: PriceField,
    discountedPrice: PriceField.optional(),
    preparationTimeMinutes: z.number().int().min(1).optional(),
    sortOrder: SortOrderField,
}).refine(
    (data) => {
        if (data.discountedPrice !== undefined) {
            return data.discountedPrice < data.price;
        }
        return true;
    },
    { message: "Discounted price must be less than original price" }
);

// ==================== CATEGORY SCHEMAS ====================

export const CreateCategorySchema = z.object({
    name: NameField,
    description: DescriptionField,
    image: MongoIdField.optional(),
    sortOrder: SortOrderField,
    availability: AvailabilitySchema.optional(),
    suggestedCategoryIds: z.array(MongoIdField).optional(),
});

export const UpdateCategorySchema = z.object({
    name: NameField.optional(),
    description: DescriptionField,
    image: MongoIdField.nullable().optional(),
    sortOrder: SortOrderField.optional(),
    isActive: z.boolean().optional(),
    availability: AvailabilitySchema.nullable().optional(),
    suggestedCategoryIds: z.array(MongoIdField).optional(),
});

// ==================== ITEM SCHEMAS ====================

export const CreateItemSchema = z.object({
    name: NameField,
    description: DescriptionField,
    image: MongoIdField.optional(),
    shortCode: ShortCodeField,
    sortOrder: SortOrderField,
    type: z.enum(["veg", "non-veg", "egg"], {
        message: "Type must be veg, non-veg, or egg",
    }),
    preparationTimeMinutes: z.number().int().min(1, "Preparation time must be at least 1 minute"),
    price: PriceField.optional(),
    discountedPrice: PriceField.optional(),
    isPopular: z.boolean().default(false),
    availability: AvailabilitySchema.optional(),
    suggestedItemIds: z.array(MongoIdField).optional(),
    variants: z.array(VariantSchema).optional(),
}).refine(
    (data) => {
        // Must have price OR variants, not both
        const hasPrice = data.price !== undefined;
        const hasVariants = data.variants && data.variants.length > 0;

        if (!hasPrice && !hasVariants) {
            return false;
        }
        return true;
    },
    { message: "Item must have either a price or variants" }
).refine(
    (data) => {
        if (data.discountedPrice !== undefined && data.price !== undefined) {
            return data.discountedPrice < data.price;
        }
        return true;
    },
    { message: "Discounted price must be less than original price" }
);

export const UpdateItemSchema = z.object({
    name: NameField.optional(),
    description: DescriptionField,
    image: MongoIdField.nullable().optional(),
    shortCode: ShortCodeField.optional(),
    sortOrder: SortOrderField.optional(),
    type: z.enum(["veg", "non-veg", "egg"]).optional(),
    preparationTimeMinutes: z.number().int().min(1).optional(),
    price: PriceField.nullable().optional(),
    discountedPrice: PriceField.nullable().optional(),
    isPopular: z.boolean().optional(),
    isActive: z.boolean().optional(),
    availability: AvailabilitySchema.nullable().optional(),
    suggestedItemIds: z.array(MongoIdField).optional(),
    variants: z.array(VariantSchema.extend({
        _id: MongoIdField.optional(), // For updating existing variants
    })).optional(),
});

// ==================== PAGINATION SCHEMA ====================

export const PaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    isActive: z.coerce.boolean().optional(),
    type: z.enum(["veg", "non-veg", "egg"]).optional(),
    isPopular: z.coerce.boolean().optional(),
});

// ==================== ROUTE VALIDATION SCHEMAS ====================

// Param schemas
const CategoryIdParam = z.object({
    categoryId: MongoIdField,
});

const ItemIdParam = z.object({
    itemId: MongoIdField,
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

// Item validations
export const GetItemsValidation = z.object({
    params: CategoryIdParam.passthrough(),
    query: PaginationSchema,
});

export const CreateItemValidation = z.object({
    params: CategoryIdParam.passthrough(),
    body: CreateItemSchema,
});

export const UpdateItemValidation = z.object({
    params: ItemIdParam.passthrough(),
    body: UpdateItemSchema,
});

export const ToggleItemValidation = z.object({
    params: ItemIdParam.passthrough(),
});

// Variant validations
export const GetVariantsValidation = z.object({
    params: ItemIdParam.passthrough(),
});

// Full menu
export const GetFullMenuValidation = z.object({
    query: z.object({
        includeInactive: z.coerce.boolean().default(false),
    }),
});

// ==================== AUTO-GENERATED DTO TYPES ====================

export type AvailabilityDTO = z.infer<typeof AvailabilitySchema>;
export type VariantDTO = z.infer<typeof VariantSchema>;
export type CreateCategoryDTO = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryDTO = z.infer<typeof UpdateCategorySchema>;
export type CreateItemDTO = z.infer<typeof CreateItemSchema>;
export type UpdateItemDTO = z.infer<typeof UpdateItemSchema>;
export type PaginationDTO = z.infer<typeof PaginationSchema>;
