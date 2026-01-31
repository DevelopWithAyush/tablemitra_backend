import { z } from "zod";

// ==================== VALIDATION SCHEMAS ====================

const mongoIdRegex = /^[0-9a-fA-F]{24}$/;
const MongoIdField = z.string().regex(mongoIdRegex, "Invalid ID format");

// Allowed file types (you can extend this based on your requirements)
const allowedFileTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

// Maximum file size: 10MB (in bytes)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ==================== REQUEST UPLOAD SCHEMA ====================

export const RequestUploadSchema = z.object({
    fileName: z
        .string()
        .min(1, "File name is required")
        .max(255, "File name must not exceed 255 characters")
        .refine(
            (name) => {
                // Basic validation for file name (no path traversal)
                return !name.includes("..") && !name.includes("/") && !name.includes("\\");
            },
            { message: "Invalid file name" }
        ),
    fileType: z
        .string()
        .min(1, "File type is required")
        .refine(
            (type) => (allowedFileTypes as readonly string[]).includes(type),
            { message: `File type must be one of: ${allowedFileTypes.join(", ")}` }
        ),
    fileSize: z
        .number()
        .positive("File size must be positive")
        .max(MAX_FILE_SIZE, `File size must not exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB`),
});

// ==================== CONFIRM UPLOAD SCHEMA ====================

export const ConfirmUploadSchema = z.object({
    attachmentId: MongoIdField,
});

// ==================== GET ATTACHMENT SCHEMA ====================

export const GetAttachmentParamsSchema = z.object({
    attachmentId: MongoIdField,
});
