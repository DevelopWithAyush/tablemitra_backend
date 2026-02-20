import { Types } from "mongoose";
import type { AuditEventActor, AuditEventContext } from "../audit/audit.types.js";

/** Passed from controller so service can publish audit events (actor + request context). */
export interface ServiceAuditContext {
    actor: AuditEventActor;
    context?: AuditEventContext;
}

// Re-export DTOs from validator
export type {
    CreateCategoryDTO,
    UpdateCategoryDTO,
    CreateServiceDTO,
    UpdateServiceDTO,
    AvailabilityDTO,
    PaginationDTO,
} from "./validator/service.validator.js";

// ==================== AVAILABILITY ====================

export interface IAvailability {
    days: number[];           // 0 = Sunday, 6 = Saturday
    startTime?: string;       // "09:00"
    endTime?: string;         // "23:00"
}

// ==================== SERVICE (Individual service item) ====================

export interface IService {
    _id: Types.ObjectId;
    hotelId: Types.ObjectId;
    categoryId: Types.ObjectId;
    name: string;
    description?: string;
    image?: Types.ObjectId | { _id: Types.ObjectId; url: string; type: string };
    shortCode: string;
    sortOrder: number;
    price: number;
    estimatedTimeMinutes?: number;
    isActive: boolean;
    availability?: IAvailability;
    createdAt: Date;
    updatedAt: Date;
}

export interface IServicePopulated extends Omit<IService, "image"> {
    image?: { _id: Types.ObjectId; url: string; type: string };
}

// ==================== CATEGORY ====================

export interface ICategory {
    _id: Types.ObjectId;
    hotelId: Types.ObjectId;
    name: string;
    description?: string;
    image?: Types.ObjectId | { _id: Types.ObjectId; url: string; type: string };
    sortOrder: number;
    isActive: boolean;
    availability?: IAvailability;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICategoryPopulated extends Omit<ICategory, "image"> {
    image?: { _id: Types.ObjectId; url: string; type: string };
}

export interface ICategoryWithServices extends ICategoryPopulated {
    services: IServicePopulated[];
}

// ==================== FULL SERVICE CATALOG RESPONSE ====================

export interface IFullServiceCatalog {
    hotelId: string;
    categories: ICategoryWithServices[];
    totalCategories: number;
    totalServices: number;
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

// ==================== USER SERVICE CATALOG (CUSTOMER-FACING) ====================

export interface UserServiceItem {
    id: string;
    name: string;
    price: number;
    discountedPrice?: number;
    description?: string;
    image: string | null;
    availability: { days: number[]; startTime?: string; endTime?: string };
    isAvailable: boolean;
}

export interface UserServiceCategory {
    id: string;
    name: string;
    image: string | null;
    items: UserServiceItem[];
}

export interface UserServiceResponse {
    categories: UserServiceCategory[];
}
