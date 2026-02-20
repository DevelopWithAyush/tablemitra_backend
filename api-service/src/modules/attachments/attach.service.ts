import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client, getS3Bucket } from "../../infra/aws/aws.js";
import Attachment from "./db/attach.model.js";
import {
    RequestUploadDTO,
    ConfirmUploadDTO,
    RequestUploadServiceResult,
    ConfirmUploadServiceResult,
    GetAttachmentServiceResult,
    AttachmentStatus,
} from "./attach.types.js";
import { Types } from "mongoose";
import logger from "../../helpers/logger/index.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

// Pre-signed URL expiration time: 1 hour (3600 seconds)
const PRESIGNED_URL_EXPIRATION = 3600;

// Pending attachment expiration time: 30 minutes
const PENDING_EXPIRATION_MINUTES = 30;

class AttachmentService {
    /**
     * Request upload URL - generates pre-signed S3 URL and creates pending attachment record
     */
    requestUpload = async (
        dto: RequestUploadDTO,
        userId: string
    ): Promise<RequestUploadServiceResult> => {
        try {
            const s3Client = getS3Client();
            const bucket = getS3Bucket();

            // Generate unique storage key
            const timestamp = Date.now();
            const randomId = new Types.ObjectId().toString();
            const fileExtension = dto.fileName.split(".").pop() || "";
            const sanitizedFileName = dto.fileName
                .replace(/[^a-zA-Z0-9.-]/g, "_")
                .substring(0, 100);
            const storageKey = `attachments/${timestamp}-${randomId}-${sanitizedFileName}`;

            // Create pre-signed URL for PUT operation
            const putCommand = new PutObjectCommand({
                Bucket: bucket,
                Key: storageKey,
                ContentType: dto.fileType,
                ContentLength: dto.fileSize,
                // Add metadata for tracking
                Metadata: {
                    uploadedBy: userId,
                    originalFileName: dto.fileName,
                },
            });

            const uploadUrl = await getSignedUrl(s3Client, putCommand, {
                expiresIn: PRESIGNED_URL_EXPIRATION,
            });

            // Generate public URL (assuming bucket is public or using CloudFront)
            const publicUrl = `https://${bucket}.s3.amazonaws.com/${storageKey}`;

            // Calculate expiration time for pending attachment (30 minutes from now)
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + PENDING_EXPIRATION_MINUTES);

            // Create attachment record with pending status
            const attachment = new Attachment({
                fileName: dto.fileName,
                fileType: dto.fileType,
                fileSize: dto.fileSize,
                storageKey,
                bucket,
                url: publicUrl,
                uploadedBy: new Types.ObjectId(userId),
                status: AttachmentStatus.PENDING,
                expiresAt,
            });

            await attachment.save();

            logger.info(`Upload URL generated for attachment: ${attachment._id}`);

            return {
                success: true,
                data: {
                    uploadUrl,
                    attachmentId: attachment._id.toString(),
                    expiresIn: PRESIGNED_URL_EXPIRATION,
                },
            };
        } catch (error) {
            logger.error("Error requesting upload URL:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to generate upload URL",
            };
        }
    };

    /**
     * Confirm upload - updates attachment status to active after successful upload
     */
    confirmUpload = async (
        dto: ConfirmUploadDTO,
        userId: string
    ): Promise<ConfirmUploadServiceResult> => {
        try {
            const attachment = await Attachment.findById(dto.attachmentId);

            if (!attachment) {
                return {
                    success: false,
                    message: "Attachment not found",
                };
            }

            // Verify ownership
            if (attachment.uploadedBy.toString() !== userId) {
                return {
                    success: false,
                    message: "Unauthorized: You can only confirm your own uploads",
                };
            }

            // Check if already confirmed
            if (attachment.status === AttachmentStatus.ACTIVE) {
                return {
                    success: true,
                    data: attachment.toObject() as any,
                };
            }

            // Check if expired
            if (attachment.status === AttachmentStatus.PENDING && attachment.expiresAt) {
                if (new Date() > attachment.expiresAt) {
                    // Delete from S3 and database
                    await this.deleteAttachmentFromS3(attachment.storageKey, attachment.bucket);
                    await Attachment.findByIdAndDelete(attachment._id);

                    return {
                        success: false,
                        message: "Upload session expired. Please request a new upload URL.",
                    };
                }
            }

            // Verify file exists in S3 (optional - you can add S3 headObject check here)
            // For now, we'll trust the frontend confirmation

            // Update status to active and remove expiration
            attachment.status = AttachmentStatus.ACTIVE;
            attachment.expiresAt = undefined;
            await attachment.save();

            logger.info(`Upload confirmed for attachment: ${attachment._id}`);

            return {
                success: true,
                data: attachment.toObject() as any,
            };
        } catch (error) {
            logger.error("Error confirming upload:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to confirm upload",
            };
        }
    };

    /**
     * Get attachment by ID
     */
    getAttachmentById = async (
        attachmentId: string,
        userId?: string
    ): Promise<GetAttachmentServiceResult> => {
        try {
            const attachment = await Attachment.findById(attachmentId).lean();

            if (!attachment) {
                return {
                    success: false,
                    message: "Attachment not found",
                };
            }

            // Optional: Add authorization check if needed
            // if (userId && attachment.uploadedBy.toString() !== userId) {
            //     return {
            //         success: false,
            //         message: "Unauthorized",
            //     };
            // }

            return {
                success: true,
                data: attachment as any,
            };
        } catch (error) {
            logger.error("Error getting attachment:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to get attachment",
            };
        }
    };

    /**
     * Get URL map for many attachments by ID (used by menu/user services for image URLs).
     * Returns only active attachments; missing IDs are omitted from the map.
     */
    getAttachmentUrlsByIds = async (attachmentIds: string[]): Promise<Record<string, string>> => {
        if (attachmentIds.length === 0) return {};
        const { Types } = await import("mongoose");
        const ids = attachmentIds.filter((id) => id).map((id) => new Types.ObjectId(id));
        const list = await Attachment.find({
            _id: { $in: ids },
            status: AttachmentStatus.ACTIVE,
        })
            .select("_id url")
            .lean();
        const map: Record<string, string> = {};
        for (const a of list) {
            if (a.url) map[a._id.toString()] = a.url;
        }
        return map;
    };

    /**
     * Cleanup expired pending attachments
     * This should be called periodically (e.g., every 5-10 minutes)
     */
    cleanupExpiredPendingAttachments = async (): Promise<number> => {
        try {
            const now = new Date();

            // Find all pending attachments that have expired
            const expiredAttachments = await Attachment.find({
                status: AttachmentStatus.PENDING,
                expiresAt: { $lte: now },
            }).lean();

            if (expiredAttachments.length === 0) {
                return 0;
            }

            logger.info(`Cleaning up ${expiredAttachments.length} expired pending attachments`);

            // Delete from S3 and database
            const deletePromises = expiredAttachments.map(async (attachment) => {
                try {
                    await this.deleteAttachmentFromS3(attachment.storageKey, attachment.bucket);
                    await Attachment.findByIdAndDelete(attachment._id);
                } catch (error) {
                    logger.error(
                        `Error deleting expired attachment ${attachment._id}:`,
                        error
                    );
                    // Still delete from database even if S3 deletion fails
                    await Attachment.findByIdAndDelete(attachment._id);
                }
            });

            await Promise.all(deletePromises);

            logger.info(`Successfully cleaned up ${expiredAttachments.length} expired attachments`);

            return expiredAttachments.length;
        } catch (error) {
            logger.error("Error cleaning up expired attachments:", error);
            return 0;
        }
    };

    /**
     * Helper method to delete attachment from S3
     */
    private deleteAttachmentFromS3 = async (
        storageKey: string,
        bucket: string
    ): Promise<void> => {
        try {
            const s3Client = getS3Client();
            const deleteCommand = new DeleteObjectCommand({
                Bucket: bucket,
                Key: storageKey,
            });

            await s3Client.send(deleteCommand);
            logger.debug(`Deleted file from S3: ${storageKey}`);
        } catch (error) {
            logger.error(`Error deleting file from S3 (${storageKey}):`, error);
            // Don't throw - allow cleanup to continue
        }
    };
}

const attachmentService = new AttachmentService();
export default attachmentService;
