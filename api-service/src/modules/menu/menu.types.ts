import { Types } from "mongoose";
import type { AuditEventActor, AuditEventContext } from "../audit/audit.types.js";

/** Passed from controller so service can publish audit events (actor + request context). */
export interface MenuAuditContext {
    actor: AuditEventActor;
    context?: AuditEventContext;
}

// Re-export DTOs from validator
export type {
    CreateCategoryDTO,
    UpdateCategoryDTO,
    CreateItemDTO,
    UpdateItemDTO,
    VariantDTO,
    AvailabilityDTO,
    PaginationDTO,
} from "./validator/menu.validator.js";

// ==================== TAX ENTRY ====================

export interface ITaxEntry {
    name: string;
    rate: number;
}

/**
 * Input shape for menu.getItemsWithTaxes (used by orders module for food orders).
 * Client-sent item line: identity, price, quantity. Server validates and returns canonical data with taxes.
 */
export interface GetItemsWithTaxesInput {
    itemId: string;
    itemName: string;
    price: number;
    discountedPrice?: number;
    quantity: number;
    variantId?: string;
    variantName?: string;
    isUpsell?: boolean;
}

/** Resolved menu item with taxes for order bill calculation. Prices are server-validated. */
export interface GetItemsWithTaxesResult {
    itemId: string;
    itemName: string;
    price: number;
    discountedPrice?: number;
    quantity: number;
    variantId?: string;
    variantName?: string;
    isUpsell: boolean;
    taxes: ITaxEntry[];
}

// ==================== AVAILABILITY ====================

export interface IAvailability {
    days: number[];           // 0 = Sunday, 6 = Saturday
    startTime?: string;       // "09:00"
    endTime?: string;         // "23:00"
}

// ==================== VARIANT ====================

export interface IVariant {
    _id: Types.ObjectId;
    hotelId: Types.ObjectId;
    itemId: Types.ObjectId;
    name: string;
    shortCode: string;
    price: number;
    discountedPrice?: number;
    preparationTimeMinutes?: number;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

// ==================== ITEM ====================

export interface IItem {
    _id: Types.ObjectId;
    hotelId: Types.ObjectId;
    categoryId: Types.ObjectId;
    name: string;
    description?: string;
    image?: Types.ObjectId | { _id: Types.ObjectId; url: string; type: string };
    shortCode: string;
    sortOrder: number;
    type: "veg" | "non-veg" | "egg";
    preparationTimeMinutes: number;
    price?: number;
    discountedPrice?: number;
    hasVariants: boolean;
    minVariantPrice?: number;
    maxVariantPrice?: number;
    isPopular: boolean;
    isActive: boolean;
    availability?: IAvailability;
    taxes?: ITaxEntry[];
    suggestedItemIds: Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}

export interface IItemWithVariants extends Omit<IItem, "image"> {
    image?: { _id: Types.ObjectId; url: string; type: string };
    variants: IVariant[];
}

/** Minimal item info for suggested-items list (e.g. on edit page) */
export interface ISuggestedItemSummary {
    _id: Types.ObjectId;
    name: string;
    shortCode: string;
    type: "veg" | "non-veg" | "egg";
    categoryId: Types.ObjectId;
    isActive: boolean;
    price?: number;
    hasVariants?: boolean;
    minVariantPrice?: number;
    maxVariantPrice?: number;
}

/** Full item detail for edit page: item + variants + populated suggestions + category */
export interface IItemDetail extends IItemWithVariants {
    suggestedItems: ISuggestedItemSummary[];
    category: { _id: Types.ObjectId; name: string };
}

// ==================== CATEGORY ====================

export interface ICategory {
    _id: Types.ObjectId;
    hotelId: Types.ObjectId;
    name: string;
    description?: string;
    image?: Types.ObjectId | { _id: Types.ObjectId; url: string; type: string };
    isActive: boolean;
    sortOrder: number;
    availability?: IAvailability;
    suggestedCategoryIds: Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}

export interface ICategoryWithItems extends Omit<ICategory, "image"> {
    image?: { _id: Types.ObjectId; url: string; type: string };
    items: IItemWithVariants[];
}

// ==================== FULL MENU QUERY OPTIONS ====================

export interface GetFullMenuOptions {
    search?: string;
    categoryIds?: string[];
    minPrice?: number;
    maxPrice?: number;
    type?: "veg" | "non-veg" | "egg";
    isPopular?: boolean;
    /** When true (default), only active categories/items are returned. When false, inactive are included. */
    activeOnly?: boolean;
}

// ==================== FULL MENU RESPONSE ====================

export interface IFullMenu {
    hotelId: string;
    categories: ICategoryWithItems[];
    totalCategories: number;
    totalItems: number;
}

// ==================== RESULT TYPES ====================

export interface SuccessResult<T> {
    success: true;
    data: T;
}

export interface FailureResult {
    success: false;
    message: string;
}

export type ServiceResult<T> = SuccessResult<T> | FailureResult;

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface ToggleResult {
    success: boolean;
    message?: string;
    isActive?: boolean;
}

// ==================== DENORMALIZED VARIANT PRICE ====================

export interface VariantPriceRange {
    minVariantPrice: number;
    maxVariantPrice: number;
}

// ==================== USER MENU (CUSTOMER-FACING) ====================

export interface UserMenuItem {
    id: string;
    name: string;
    price: number;
    discountedPrice?: number;
    description?: string;
    image: string | null;
    isAvailable: boolean;
    hasVariants: boolean;
    type: "veg" | "non-veg" | "egg";
    taxes?: ITaxEntry[];
}

export interface UserMenuCategory {
    id: string;
    name: string;
    image: string | null;
    items: UserMenuItem[];
}

export interface UserMenuResponse {
    categories: UserMenuCategory[];
}

// ==================== ITEM DETAIL FOR CUSTOMER (ADD-TO-CART DIALOG) ====================

export interface ItemDetailVariant {
    id: string;
    name: string;
    price: number;
    discountedPrice?: number;
    isAvailable: boolean;
}

/** Suggested add-on: either full item (no variants) or one entry per variant (flattened). */
export interface ItemDetailSuggestedItem {
    id: string;       // variantId when item has variants, else itemId
    itemId: string;   // parent item id (for cart)
    /** Full display name: e.g. "Chicken Biryani Half" (item + variant) or item name when no variants */
    name: string;
    price: number;
    discountedPrice?: number;
    isAvailable: boolean;
    type: "veg" | "non-veg" | "egg";
    /** Per-item taxes (same for all variants of an item). */
    taxes?: ITaxEntry[];
}

export interface ItemDetailForCustomer {
    id: string;
    name: string;
    taxes?: ITaxEntry[];
    price: number;
    discountedPrice?: number;
    description?: string;
    image: string | null;
    isAvailable: boolean;
    type: "veg" | "non-veg" | "egg";
    variants: ItemDetailVariant[];
    suggestedItems: ItemDetailSuggestedItem[];
}
