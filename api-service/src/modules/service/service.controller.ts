import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import serviceOptimizationService from "./service.service.js";
import {
    CreateCategorySchema,
    UpdateCategorySchema,
    CreateServiceSchema,
    UpdateServiceSchema,
    PaginationSchema,
} from "./validator/service.validator.js";
import { IJwtPayload } from "../auth/auth.types.js";

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

// ==================== CATEGORY CONTROLLERS ====================

/**
 * Get all categories for the hotel
 * GET /categories
 */
export const getCategories = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const query = PaginationSchema.parse(req.query);

    const result = await serviceOptimizationService.getCategories(hotelId, query);

    return res.json({
        success: true,
        ...result,
    });
});

/**
 * Create a new category
 * POST /categories
 */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const dto = CreateCategorySchema.parse(req.body);

    const result = await serviceOptimizationService.createCategory(hotelId, dto);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
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
    const { categoryId } = req.params;
    const dto = UpdateCategorySchema.parse(req.body);

    const result = await serviceOptimizationService.updateCategory(hotelId, categoryId, dto);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
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
    const { categoryId } = req.params;

    const result = await serviceOptimizationService.toggleCategory(hotelId, categoryId);

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
    const { categoryId } = req.params;
    const query = PaginationSchema.parse(req.query);

    const result = await serviceOptimizationService.getServices(hotelId, categoryId, query);

    if (!result.success) {
        return res.status(404).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        ...result.data,
    });
});

/**
 * Create a new service
 * POST /categories/:categoryId/services
 */
export const createService = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const { categoryId } = req.params;
    const dto = CreateServiceSchema.parse(req.body);

    const result = await serviceOptimizationService.createService(hotelId, categoryId, dto);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
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
    const { serviceId } = req.params;
    const dto = UpdateServiceSchema.parse(req.body);

    const result = await serviceOptimizationService.updateService(hotelId, serviceId, dto);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
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
    const { serviceId } = req.params;

    const result = await serviceOptimizationService.toggleService(hotelId, serviceId);

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
        return res.status(500).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        data: result.data,
    });
});
