import { Types } from "mongoose";

// Re-export DTOs from validator
export type {
    CreateAdminDTO,
    UpdateAdminDTO,
    CreateCustomerCareDTO,
    UpdateCustomerCareDTO,
    CreateSalesDTO,
    UpdateSalesDTO,
    PaginationDTO,
} from "./validator/company.validator.js";

// ==================== PROFILE INTERFACES ====================

export interface IAdminProfile {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    name?: string;
    email?: string;
    isEmailVerified: boolean;
    profilePicture?: Types.ObjectId | { _id: Types.ObjectId; url: string; type: string };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICustomerCareProfile {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    employeeCode: string;
    designation: "CUSTOMER_CARE" | "CUSTOMER_CARE_LEAD" | "CUSTOMER_CARE_MANAGER";
    name: string;
    email: string;
    isEmailVerified: boolean;
    profilePicture?: Types.ObjectId | { _id: Types.ObjectId; url: string; type: string };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ISalesProfile {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    employeeCode: string;
    name: string;
    email: string;
    isEmailVerified: boolean;
    profilePicture?: Types.ObjectId | { _id: Types.ObjectId; url: string; type: string };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// ==================== RESULT TYPES ====================

export interface ProfileSuccessResult<T> {
    success: true;
    profile: T;
}

export interface ProfileFailureResult {
    success: false;
    message: string;
}

export type ProfileResult<T> = ProfileSuccessResult<T> | ProfileFailureResult;

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface CreateResult {
    success: boolean;
    profile?: Record<string, unknown>;
    message?: string;
}

export interface UpdateResult {
    success: boolean;
    profile?: Record<string, unknown>;
    message?: string;
}

export interface DeleteResult {
    success: boolean;
    message?: string;
}
