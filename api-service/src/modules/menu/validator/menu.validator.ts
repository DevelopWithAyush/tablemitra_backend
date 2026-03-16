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
/** Allows 0 for complimentary items (e.g. water). Use with .optional() or .nullable() as needed. */
const PriceFieldAllowZero = z.coerce.number().min(0, "Price must be non-negative");

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

// ==================== TAX ENTRY SCHEMA ====================

const TaxEntrySchema = z.object({
    name: z.string().min(1, "Tax name is required").max(50, "Tax name must not exceed 50 characters").trim(),
    rate: z.number().min(0, "Tax rate must be non-negative").max(100, "Tax rate must not exceed 100"),
});

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
            return data.discountedPrice <= data.price;
        }
        return true;
    },
    { message: "Discounted price must be less than or equal to original price" }
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
    price: PriceFieldAllowZero.optional(),
    discountedPrice: PriceFieldAllowZero.optional(),
    isPopular: z.boolean().default(false),
    availability: AvailabilitySchema.optional(),
    taxes: z.array(TaxEntrySchema).optional(),
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
            return data.discountedPrice <= data.price;
        }
        return true;
    },
    { message: "Discounted price must be less than or equal to original price" }
).refine(
    (data) => {
        if (data.variants && data.variants.length > 1) {
            const codes = data.variants.map((v) => v.shortCode.toUpperCase());
            return codes.length === new Set(codes).size;
        }
        return true;
    },
    { message: "Variant short codes must be unique within the item" }
);

export const UpdateItemSchema = z.object({
    name: NameField.optional(),
    description: DescriptionField,
    image: MongoIdField.nullable().optional(),
    shortCode: ShortCodeField.optional(),
    sortOrder: SortOrderField.optional(),
    type: z.enum(["veg", "non-veg", "egg"]).optional(),
    preparationTimeMinutes: z.number().int().min(1).optional(),
    price: PriceFieldAllowZero.nullable().optional(),
    discountedPrice: PriceFieldAllowZero.nullable().optional(),
    isPopular: z.boolean().optional(),
    isActive: z.boolean().optional(),
    availability: AvailabilitySchema.nullable().optional(),
    taxes: z.array(TaxEntrySchema).nullable().optional(),
    suggestedItemIds: z.array(MongoIdField).optional(),
    variants: z.array(VariantSchema).optional(),
}).refine(
    (data) => {
        if (data.variants && data.variants.length === 0) {
            return data.price !== undefined && data.price !== null;
        }
        return true;
    },
    { message: "Price is required when removing all variants (converting to non-variant item)", path: ["price"] }
).refine(
    (data) => {
        if (data.variants && data.variants.length > 1) {
            const codes = data.variants.map((v) => v.shortCode.toUpperCase());
            return codes.length === new Set(codes).size;
        }
        return true;
    },
    { message: "Variant short codes must be unique within the item", path: ["variants"] }
);

// ==================== PAGINATION SCHEMA ====================

export const PaginationSchema = z.object({
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

// Get single item by ID (full detail for edit page)
export const GetItemByIdValidation = z.object({
    params: ItemIdParam.passthrough(),
});

// User menu (customer-facing): hotelId optional (else from cookie customer_room_hotel_id)
export const GetUserMenuValidation = z.object({
    query: z.object({
        hotelId: MongoIdField.optional(),
    }),
});

// Item detail for customer (add-to-cart dialog): itemId in params, hotelId optional in query
export const GetItemDetailForUserValidation = z.object({
    params: z.object({ itemId: MongoIdField }),
    query: z.object({ hotelId: MongoIdField.optional() }),
});

// Full menu – super search (search, categoryIds, price range, type, isPopular, activeOnly)
const optionalBooleanQuery = z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === true || val === "true"));

export const GetFullMenuValidation = z.object({
    query: z.object({
        search: z.string().min(1).max(200).optional(),
        categoryIds: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .transform((val): string[] | undefined => {
                if (val === undefined) return undefined;
                const arr = Array.isArray(val) ? val : val.split(",").map((s) => s.trim()).filter(Boolean);
                return arr.length ? arr : undefined;
            })
            .refine((arr) => !arr || arr.every((id) => mongoIdRegex.test(id)), "Invalid category ID format"),
        minPrice: z.coerce.number().min(0).optional(),
        maxPrice: z.coerce.number().min(0).optional(),
        type: z.enum(["veg", "non-veg", "egg"]).optional(),
        isPopular: optionalBooleanQuery,
        activeOnly: optionalBooleanQuery.default(true),
    }).refine((data) => data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice, {
        message: "minPrice must be less than or equal to maxPrice",
        path: ["maxPrice"],
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
