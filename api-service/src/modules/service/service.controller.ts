import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendServiceError } from "../../utils/error-response.js";
import serviceOptimizationService from "./service.service.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import {
    CreateCategorySchema,
    UpdateCategorySchema,
    CreateServiceSchema,
    UpdateServiceSchema,
    PaginationSchema,
    GetUserServiceCatalogValidation,
} from "./validator/service.validator.js";
import { IJwtPayload } from "../auth/auth.types.js";
import type { ServiceAuditContext } from "./service.types.js";
import type { ActorRole } from "../audit/audit.types.js";

// ==================== HELPER ====================

/**
 * Extract hotelId from JWT context
 */
const getHotelIdFromContext = (req: Request): string => {
    const user = (req as any).user as IJwtPayload;
    const hotelId = user?.ctx?.id;
    if (!hotelId) {
        throw new Error("Hotel context not found in token");
    }
    return hotelId;
};

function getAuditContext(req: Request): ServiceAuditContext {
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

// ==================== CATEGORY CONTROLLERS ====================

/**
 * Get all categories for the hotel
 * GET /categories
 */
export const getCategories = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const query = PaginationSchema.parse(req.query);

    const data = await serviceOptimizationService.getCategories(hotelId, query);

    return res.json({
        success: true,
        data,
    });
});

/**
 * Create a new category
 * POST /categories
 */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const dto = CreateCategorySchema.parse(req.body);

    const result = await serviceOptimizationService.createCategory(hotelId, dto, getAuditContext(req));

    if (!result.success) {
        return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: result.data,
    });
});

/**
 * Update a category
 * PUT /categories/:categoryId
 */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const categoryId = req.params.categoryId as string;
    const dto = UpdateCategorySchema.parse(req.body);

    const result = await serviceOptimizationService.updateCategory(hotelId, categoryId, dto, getAuditContext(req));

    if (!result.success) {
        return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: "Category updated successfully",
        data: result.data,
    });
});

/**
 * Toggle category active status
 * PUT /categories/:categoryId/toggle
 */
export const toggleCategory = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const categoryId = req.params.categoryId as string;

    const result = await serviceOptimizationService.toggleCategory(hotelId, categoryId, getAuditContext(req));

    if (!result.success) {
        return res.status(404).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: result.message,
        data: { isActive: result.isActive },
    });
});

// ==================== SERVICE CONTROLLERS ====================

/**
 * Get services in a category
 * GET /categories/:categoryId/services
 */
export const getServices = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const categoryId = req.params.categoryId as string;
    const query = PaginationSchema.parse(req.query);

    const result = await serviceOptimizationService.getServices(hotelId, categoryId, query);

    if (!result.success) {
        return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.data,
    });
});

/**
 * Create a new service
 * POST /categories/:categoryId/services
 */
export const createService = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const categoryId = req.params.categoryId as string;
    const dto = CreateServiceSchema.parse(req.body);

    const result = await serviceOptimizationService.createService(hotelId, categoryId, dto, getAuditContext(req));

    if (!result.success) {
        return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.status(201).json({
        success: true,
        message: "Service created successfully",
        data: result.data,
    });
});

/**
 * Update a service
 * PUT /services/:serviceId
 */
export const updateService = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const serviceId = req.params.serviceId as string;
    const dto = UpdateServiceSchema.parse(req.body);

    const result = await serviceOptimizationService.updateService(hotelId, serviceId, dto, getAuditContext(req));

    if (!result.success) {
        return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: "Service updated successfully",
        data: result.data,
    });
});

/**
 * Toggle service active status
 * PUT /services/:serviceId/toggle
 */
export const toggleService = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const serviceId = req.params.serviceId as string;

    const result = await serviceOptimizationService.toggleService(hotelId, serviceId, getAuditContext(req));

    if (!result.success) {
        return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: result.message,
        data: { isActive: result.isActive },
    });
});

// ==================== FULL CATALOG CONTROLLERS ====================

/**
 * Get full service catalog with nested structure
 * GET /all-services
 */
export const getFullCatalog = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const includeInactive = req.query.includeInactive === "true";

    const result = await serviceOptimizationService.getFullCatalog(hotelId, includeInactive);

    if (!result.success) {
        return sendServiceError(res, 500, result.message ?? "Internal server error", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.data,
    });
});

// ==================== USER SERVICE CATALOG (CUSTOMER-FACING) ====================

/**
 * Get service catalog for customer. hotelId from query or cookie customer_room_hotel_id.
 * Protected; returns categories with items, availability object and isAvailable per item.
 */
export const getServiceCatalogForUser = asyncHandler(async (req: Request, res: Response) => {
    GetUserServiceCatalogValidation.parse({ query: req.query });
    const hotelId =
        (req.query.hotelId as string | undefined) ||
        (req.cookies?.customer_room_hotel_id as string | undefined);
    if (!hotelId) {
        return sendServiceError(res, 400, "Hotel context required: provide hotelId query or customer_room_hotel_id cookie", { instance: req.originalUrl });
    }

    const tzResult = await hospitalityService.getHotelTimezone(hotelId);
    if (!tzResult.success) {
        return sendServiceError(res, 404, tzResult.message ?? "Hotel not found", { instance: req.originalUrl });
    }

    const result = await serviceOptimizationService.getServiceCatalogForUser(hotelId, tzResult.data!);
    if (!result.success) {
        return sendServiceError(res, 500, result.message ?? "Failed to load catalog", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.data,
    });
});
