import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendServiceError } from "../../utils/error-response.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import { qrCodeService } from "./qr-code.service.js";
import { DeleteQrCodeParams, DeleteQrCodeBody } from "./qr-code.types.js";
import type {
    HotelIdParams,
    IGenerateQrCodesInput,
    IAddSingleQrCodeInput,
    IToggleQrStatusInput,
    GetQrCodesQuery,
    ScanQrCodeParams,
    GetLocationsQuery,
    DownloadQrCodesQuery,
} from "./qr-code.types.js";
import type { QrCodeAuditContext } from "./qr-code.types.js";
import type { ActorRole } from "../audit/audit.types.js";
import { IJwtPayload } from "../auth/auth.types.js";

function getAuditContext(req: Request): QrCodeAuditContext {
    const user = (req as Request & { user: IJwtPayload }).user;
    const app = req.params.app;
    const panel = typeof app === "string" ? app : app?.[0];
    const roleByApp: Record<string, ActorRole> = {
        sales: "SALES",
        founder: "FOUNDER",
        admin: "ADMIN",
        manager: "MANAGER",
        frontdesk: "FRONTDESK_STAFF",
        kitchen: "KITCHEN_STAFF",
        "room-service": "ROOM_SERVICE_STAFF",
    };
    const role: ActorRole = (panel && roleByApp[panel]) || "ADMIN";
    return {
        actor: { userId: user.sub, role },
        context: { ip: req.ip, userAgent: req.get("User-Agent") ?? undefined, panel },
    };
}

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
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
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

        const result = await qrCodeService.generateQrCodes(hotelId, input, getAuditContext(req));

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
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
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
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

        const result = await qrCodeService.addSingleQrCode(hotelId, input, getAuditContext(req));

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
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
        const codeId = req.params.codeId as string;
        const { isActive, reason } = req.body as { isActive: boolean; reason?: string };

        const result = await qrCodeService.toggleQrStatus(codeId, { isActive, reason }, getAuditContext(req));

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
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
        const codeId = req.params.codeId as string;
        const { reason } = (req.body || {}) as { reason?: string };

        const result = await qrCodeService.deleteQrCode(codeId, reason, getAuditContext(req));

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
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
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(200).json({
            success: true,
            message: result.message,
            data: { locations: result.data }
        });
    });

    /**
     * Download QR codes as PDF
     * GET /qr-codes/hotels/:hotelId/download?type=ROOM|RESTAURANT|BAR&floor=&roomNumber=&zone=&tableNumber=
     * Fetches hotel (name, logo) via hospitality service (DDD). Filename includes hotel name and query.
     */
    downloadQrCodesPdf = asyncHandler(async (req: Request, res: Response) => {
        const { hotelId } = req.params as unknown as HotelIdParams;
        const query = req.query as unknown as DownloadQrCodesQuery;

        const hotelResult = await hospitalityService.getHotelById(hotelId);
        if (!hotelResult.success || !hotelResult.data) {
            return sendServiceError(res, 404, hotelResult.message ?? "Hotel not found", { instance: req.originalUrl });
        }

        const hotelData = hotelResult.data as { name?: string; logo?: { url?: string } | string };
        const hotelName = typeof hotelData.name === "string" ? hotelData.name : "Hotel";
        const hotelLogoUrl =
            hotelData.logo && typeof hotelData.logo === "object" && typeof (hotelData.logo as { url?: string }).url === "string"
                ? (hotelData.logo as { url: string }).url
                : undefined;

        const codesResult = await qrCodeService.getQrCodesForDownload(hotelId, query);
        if (!codesResult.success || !codesResult.data) {
            return sendServiceError(res, 404, codesResult.message ?? "Not found", { instance: req.originalUrl });
        }

        const pdfResult = await qrCodeService.generateQrPdf(codesResult.data, { hotelLogoUrl });
        if (!pdfResult.success || !pdfResult.data) {
            return sendServiceError(res, 500, pdfResult.message ?? "Failed to generate PDF", { instance: req.originalUrl });
        }

        const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-").trim() || "";
        const safeName = sanitize(hotelName) || "hotel";
        const parts = [safeName, query.type];
        if (query.type === "ROOM") {
            if (query.floor) parts.push(`floor-${sanitize(query.floor)}`);
            if (query.roomNumber) parts.push(`room-${sanitize(query.roomNumber)}`);
        } else {
            if (query.zone) parts.push(`zone-${sanitize(query.zone)}`);
            if (query.tableNumber) parts.push(`table-${sanitize(query.tableNumber)}`);
        }
        const filename = `${parts.filter(Boolean).join("-")}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(pdfResult.data);
    });

    /**
     * Scan QR code (public endpoint for customers)
     * GET /qr-codes/scan/:code
     */
    scanQrCode = asyncHandler(async (req: Request, res: Response) => {
        const { code } = req.params as unknown as ScanQrCodeParams;

        const result = await qrCodeService.getQrCodeByCode(code);

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        if (!result.data) {
            return sendServiceError(res, 404, "QR Code not found or inactive", { instance: req.originalUrl });
        }

        return res.status(200).json({
            success: true,
            data: result.data,
        });
    });
}

export const qrCodeController = new QrCodeController();
