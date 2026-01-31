import { Types } from "mongoose";

// ==================== ENUMS ====================

export enum AttachmentStatus {
    PENDING = "pending",
    ACTIVE = "active",
    INACTIVE = "inactive",
    DELETED = "deleted",
}

// ==================== DTOs ====================

export interface RequestUploadDTO {
    fileName: string;
    fileType: string;
    fileSize: number;
}

export interface ConfirmUploadDTO {
    attachmentId: string;
}

// ==================== RESPONSE TYPES ====================

export interface UploadUrlResponse {
    uploadUrl: string;
    attachmentId: string;
    expiresIn: number; // seconds
}

export interface AttachmentResponse {
    _id: Types.ObjectId;
    fileName: string;
    fileType: string;
    fileSize: number;
    storageKey: string;
    bucket: string;
    url: string;
    uploadedBy: Types.ObjectId;
    status: AttachmentStatus;
    expiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

// ==================== SERVICE RESULT TYPES ====================

export interface RequestUploadResult {
    success: true;
    data: UploadUrlResponse;
}

export interface RequestUploadFailure {
    success: false;
    message: string;
}

export type RequestUploadServiceResult = RequestUploadResult | RequestUploadFailure;

export interface ConfirmUploadResult {
    success: true;
    data: AttachmentResponse;
}

export interface ConfirmUploadFailure {
    success: false;
    message: string;
}

export type ConfirmUploadServiceResult = ConfirmUploadResult | ConfirmUploadFailure;

export interface GetAttachmentResult {
    success: true;
    data: AttachmentResponse;
}

export interface GetAttachmentFailure {
    success: false;
    message: string;
}

export type GetAttachmentServiceResult = GetAttachmentResult | GetAttachmentFailure;
