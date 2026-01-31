import { Types } from "mongoose";

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
    suggestedItemIds: Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}

export interface IItemWithVariants extends Omit<IItem, "image"> {
    image?: { _id: Types.ObjectId; url: string; type: string };
    variants: IVariant[];
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
