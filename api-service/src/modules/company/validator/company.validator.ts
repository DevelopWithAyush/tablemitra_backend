import { z } from "zod";

// ==================== BASE SCHEMAS ====================

const phoneRegex = /^\+?[1-9]\d{1,14}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mongoIdRegex = /^[0-9a-fA-F]{24}$/;

// Common fields
const PhoneField = z.string().regex(phoneRegex, "Invalid phone number format");
const EmailField = z.string().regex(emailRegex, "Invalid email format");
const NameField = z.string().min(2, "Name must be at least 2 characters").max(100, "Name must not exceed 100 characters");
const MongoIdField = z.string().regex(mongoIdRegex, "Invalid ID format");

// ==================== ADMIN SCHEMAS ====================

export const CreateAdminSchema = z.object({
    phone: PhoneField,
    name: NameField,
    email: EmailField,
});

export const UpdateAdminSchema = z.object({
    name: NameField.optional(),
    email: EmailField.optional(),
    profilePicture: MongoIdField.optional(),
    isActive: z.boolean().optional(),
});

// ==================== CUSTOMER CARE SCHEMAS ====================

export const CreateCustomerCareSchema = z.object({
    phone: PhoneField,
    name: NameField,
    email: EmailField,
    designation: z.enum(
        ["CUSTOMER_CARE", "CUSTOMER_CARE_LEAD", "CUSTOMER_CARE_MANAGER"],
        "Designation must be CUSTOMER_CARE, CUSTOMER_CARE_LEAD, or CUSTOMER_CARE_MANAGER"
    ),
});

export const UpdateCustomerCareSchema = z.object({
    name: NameField.optional(),
    email: EmailField.optional(),
    designation: z.enum(
        ["CUSTOMER_CARE", "CUSTOMER_CARE_LEAD", "CUSTOMER_CARE_MANAGER"],
        "Designation must be CUSTOMER_CARE, CUSTOMER_CARE_LEAD, or CUSTOMER_CARE_MANAGER"
    ).optional(),
    profilePicture: MongoIdField.optional(),
    isActive: z.boolean().optional(),
});

// ==================== SALES SCHEMAS ====================

export const CreateSalesSchema = z.object({
    phone: PhoneField,
    name: NameField,
    email: EmailField,
});

export const UpdateSalesSchema = z.object({
    name: NameField.optional(),
    email: EmailField.optional(),
    profilePicture: MongoIdField.optional(),
    isActive: z.boolean().optional(),
});

// ==================== PAGINATION SCHEMA ====================

export const PaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    isActive: z.coerce.boolean().optional(),
});

// ==================== ROUTE VALIDATION SCHEMAS ====================

// Param schemas
const IdParam = z.object({
    id: MongoIdField,
});

// Admin validations
export const CreateAdminValidation = z.object({
    body: CreateAdminSchema,
});

export const UpdateAdminValidation = z.object({
    params: IdParam.passthrough(),
    body: UpdateAdminSchema,
});

export const GetAdminByIdValidation = z.object({
    params: IdParam.passthrough(),
});

export const DeleteAdminValidation = z.object({
    params: IdParam.passthrough(),
});

// Customer Care validations
export const CreateCustomerCareValidation = z.object({
    body: CreateCustomerCareSchema,
});

export const UpdateCustomerCareValidation = z.object({
    params: IdParam.passthrough(),
    body: UpdateCustomerCareSchema,
});

export const GetCustomerCareByIdValidation = z.object({
    params: IdParam.passthrough(),
});

export const DeleteCustomerCareValidation = z.object({
    params: IdParam.passthrough(),
});

// Sales validations
export const CreateSalesValidation = z.object({
    body: CreateSalesSchema,
});

export const UpdateSalesValidation = z.object({
    params: IdParam.passthrough(),
    body: UpdateSalesSchema,
});

export const GetSalesByIdValidation = z.object({
    params: IdParam.passthrough(),
});

export const DeleteSalesValidation = z.object({
    params: IdParam.passthrough(),
});

// ==================== AUTO-GENERATED DTO TYPES ====================

export type CreateAdminDTO = z.infer<typeof CreateAdminSchema>;
export type UpdateAdminDTO = z.infer<typeof UpdateAdminSchema>;
export type CreateCustomerCareDTO = z.infer<typeof CreateCustomerCareSchema>;
export type UpdateCustomerCareDTO = z.infer<typeof UpdateCustomerCareSchema>;
export type CreateSalesDTO = z.infer<typeof CreateSalesSchema>;
export type UpdateSalesDTO = z.infer<typeof UpdateSalesSchema>;
export type PaginationDTO = z.infer<typeof PaginationSchema>;
