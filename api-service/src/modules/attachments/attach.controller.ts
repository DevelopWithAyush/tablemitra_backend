import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendServiceError } from "../../utils/error-response.js";
import { IJwtPayload } from "../auth/auth.types.js";
import attachmentService from "./attach.service.js";
import {
    RequestUploadSchema,
    ConfirmUploadSchema,
    GetAttachmentParamsSchema,
} from "./validator/attach.validator.js";

/**
 * Request upload URL
 * POST /api/v1/:app/attachments/request-upload
 */
export const requestUpload = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user as IJwtPayload;
    const dto = RequestUploadSchema.parse(req.body);

    const result = await attachmentService.requestUpload(dto, user.sub);

    if (!result.success) {
        return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.status(201).json({
        success: true,
        message: "Upload URL generated successfully",
        data: result.data,
    });
});

/**
 * Confirm upload
 * POST /api/v1/:app/attachments/confirm-upload
 */
export const confirmUpload = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user as IJwtPayload;
    const dto = ConfirmUploadSchema.parse(req.body);

    const result = await attachmentService.confirmUpload(dto, user.sub);

    if (!result.success) {
        return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: "Upload confirmed successfully",
        data: result.data,
    });
});

/**
 * Get attachment by ID
 * GET /api/v1/:app/attachments/:attachmentId
 */
export const getAttachmentById = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user as IJwtPayload;
    const { attachmentId } = GetAttachmentParamsSchema.parse(req.params);

    const result = await attachmentService.getAttachmentById(attachmentId, user.sub);

    if (!result.success) {
        return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.data,
    });
});
