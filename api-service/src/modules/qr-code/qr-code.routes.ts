import { Router } from "express";
import { qrCodeController } from "./qr-code.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
    GenerateQrCodesSchema,
    GetQrCodesSchema,
    AddSingleQrCodeSchema,
    ToggleQrStatusSchema,
    GetLocationsSchema,
    HotelIdParamSchema,
    ScanQrCodeSchema,
    DeleteQrCodeSchema,
    DownloadQrCodesSchema,
} from "./validator/qr-code.validator.js";

const qrCodeRoutes = Router({ mergeParams: true });

// ==================== Public Routes ====================

// Scan QR code
qrCodeRoutes.get(
    "/scan/:code",
    validate(ScanQrCodeSchema),
    qrCodeController.scanQrCode
);

// ==================== Authenticated Routes ====================

qrCodeRoutes.use(authMiddleware);

// Get QR Set (Legacy/Existing)
qrCodeRoutes.get(
    "/hotels/:hotelId/set",
    requirePermissions("VIEW_QR", "all", true),
    validate(HotelIdParamSchema),
    qrCodeController.getQrSet
);

// Get QR Codes (Filtered)
qrCodeRoutes.get(
    "/hotels/:hotelId",
    requirePermissions("VIEW_QR", "all", true),
    validate(GetQrCodesSchema),
    qrCodeController.getQrCodes
);

// Download QR codes as PDF (filter by type + optional floor/room or zone/table)
qrCodeRoutes.get(
    "/hotels/:hotelId/download",
    requirePermissions("VIEW_QR", "all", true),
    validate(DownloadQrCodesSchema),
    qrCodeController.downloadQrCodesPdf
);

// Get Distinct Locations
qrCodeRoutes.get(
    "/hotels/:hotelId/locations",
    requirePermissions("VIEW_QR", "all", true),
    validate(GetLocationsSchema),
    qrCodeController.getLocations
);

// Bulk Generate QR Codes
qrCodeRoutes.post(
    "/hotels/:hotelId/bulk-generate",
    requirePermissions("CREATE_QR", "all", true),
    validate(GenerateQrCodesSchema),
    qrCodeController.generateQrCodes
);

// Add Single QR Code
qrCodeRoutes.post(
    "/hotels/:hotelId/single",
    requirePermissions("CREATE_QR", "all", true),
    validate(AddSingleQrCodeSchema),
    qrCodeController.addSingleQrCode
);

// Toggle Status (Activate/Deactivate)
qrCodeRoutes.patch(
    "/:codeId/status",
    requirePermissions("UPDATE_QR", "all", true),
    validate(ToggleQrStatusSchema),
    qrCodeController.toggleStatus
);

// Delete QR Code (Soft Delete)
qrCodeRoutes.delete(
    "/:codeId",
    requirePermissions("UPDATE_QR", "all", true),
    validate(DeleteQrCodeSchema),
    qrCodeController.deleteQrCode
); 



export default qrCodeRoutes;