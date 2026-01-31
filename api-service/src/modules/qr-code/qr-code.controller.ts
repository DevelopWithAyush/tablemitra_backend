import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { qrCodeService } from "./qr-code.service.js";
import { DeleteQrCodeParams, DeleteQrCodeBody } from "./qr-code.types.js";
import type {
    HotelIdParams,
    IGenerateQrCodesInput,
    IAddSingleQrCodeInput,
    IToggleQrStatusInput,
    GetQrCodesQuery,
    ScanQrCodeParams,
    GetLocationsQuery
} from "./qr-code.types.js";

/**
 * QR Code Controller
 * Handles all QR code-related HTTP requests
 */
class QrCodeController {
    // ==================== QR Set Operations ====================

    /**
     * Get QR Set for a hotel
     * GET /qr-codes/hotels/:hotelId/set
     */
    getQrSet = asyncHandler(async (req: Request, res: Response) => {
        const { hotelId } = req.params as unknown as HotelIdParams;

        const result = await qrCodeService.getQrSetByHotelId(hotelId);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            data: result.data,
        });
    });

    // ==================== QR Code Operations ====================

    /**
     * Unified Bulk Generate QR Codes
     * POST /qr-codes/hotels/:hotelId/bulk-generate
     */
    generateQrCodes = asyncHandler(async (req: Request, res: Response) => {
        const { hotelId } = req.params as unknown as HotelIdParams;
        const input = req.body as IGenerateQrCodesInput;

        const result = await qrCodeService.generateQrCodes(hotelId, input);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(201).json({
            success: true,
            message: result.message,
            data: result.data,
        });
    });

    /**
     * Get QR Codes (Filtered)
     * GET /qr-codes/hotels/:hotelId
     */
    getQrCodes = asyncHandler(async (req: Request, res: Response) => {
        const { hotelId } = req.params as unknown as HotelIdParams;
        const { type, status } = req.query as unknown as GetQrCodesQuery;

        const result = await qrCodeService.getQrCodes(hotelId, type, status);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data,
        });
    });

    /**
     * Add Single QR Code
     * POST /qr-codes/hotels/:hotelId/single
     */
    addSingleQrCode = asyncHandler(async (req: Request, res: Response) => {
        const { hotelId } = req.params as unknown as HotelIdParams;
        const input = req.body as IAddSingleQrCodeInput;

        const result = await qrCodeService.addSingleQrCode(hotelId, input);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(201).json({
            success: true,
            message: result.message,
            data: result.data,
        });
    });

    /**
     * Toggle QR Code Status (Activate/Deactivate)
     * PATCH /qr-codes/:codeId/status
     */
    toggleStatus = asyncHandler(async (req: Request, res: Response) => {
        const { codeId } = req.params as unknown as { codeId: string };
        const { isActive, reason } = req.body as { isActive: boolean; reason?: string };

        const result = await qrCodeService.toggleQrStatus(codeId, { isActive, reason });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: result.message,
        });
    });

    /**
     * Delete QR Code (Soft Delete)
     * DELETE /qr-codes/:codeId
     */
    deleteQrCode = asyncHandler(async (req: Request, res: Response) => {
        const { codeId } = req.params as { codeId: string };
        const { reason } = (req.body || {}) as { reason?: string };

        const result = await qrCodeService.deleteQrCode(codeId, reason);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: result.message,
        });
    });

    /**
     * Get Distinct Locations
     * GET /qr-codes/hotels/:hotelId/locations
     */
    getLocations = asyncHandler(async (req: Request, res: Response) => {
        const { hotelId } = req.params as unknown as HotelIdParams;
        const { type } = req.query as unknown as GetLocationsQuery;

        const result = await qrCodeService.getDistinctLocations(hotelId, type);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: result.message,
            data: { locations: result.data }
        });
    });

    /**
     * Scan QR code (public endpoint for customers)
     * GET /qr-codes/scan/:code
     */
    scanQrCode = asyncHandler(async (req: Request, res: Response) => {
        const { code } = req.params as unknown as ScanQrCodeParams;

        const result = await qrCodeService.getQrCodeByCode(code);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        if (!result.data) {
            return res.status(404).json({
                success: false,
                message: "QR Code not found or inactive",
            });
        }

        return res.status(200).json({
            success: true,
            data: result.data,
        });
    });
}

export const qrCodeController = new QrCodeController();
