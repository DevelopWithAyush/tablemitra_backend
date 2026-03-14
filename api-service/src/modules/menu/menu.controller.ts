import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendServiceError } from "../../utils/error-response.js";
import menuService from "./menu.service.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import {
    CreateCategorySchema,
    UpdateCategorySchema,
    CreateItemSchema,
    UpdateItemSchema,
    PaginationSchema,
    GetFullMenuValidation,
    GetUserMenuValidation,
    GetItemDetailForUserValidation,
} from "./validator/menu.validator.js";
import { IJwtPayload } from "../auth/auth.types.js";
import type { MenuAuditContext } from "./menu.types.js";
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

function getAuditContext(req: Request): MenuAuditContext {
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

    const data = await menuService.getCategories(hotelId, query);

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

    const result = await menuService.createCategory(hotelId, dto, getAuditContext(req));

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

    const result = await menuService.updateCategory(hotelId, categoryId, dto, getAuditContext(req));

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

    const result = await menuService.toggleCategory(hotelId, categoryId, getAuditContext(req));

    if (!result.success) {
        return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: result.message,
        data: { isActive: result.isActive },
    });
});

// ==================== ITEM CONTROLLERS ====================

/**
 * Get items in a category
 * GET /categories/:categoryId/items
 */
export const getItems = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const categoryId = req.params.categoryId as string;
    const query = PaginationSchema.parse(req.query);

    const result = await menuService.getItems(hotelId, categoryId, query);

    if (!result.success) {
        return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.data,
    });
});

/**
 * Create a new item with optional variants
 * POST /categories/:categoryId/items
 */
export const createItem = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const categoryId = req.params.categoryId as string;
    const dto = CreateItemSchema.parse(req.body);

    const result = await menuService.createItem(hotelId, categoryId, dto, getAuditContext(req));

    if (!result.success) {
        return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.status(201).json({
        success: true,
        message: "Item created successfully",
        data: result.data,
    });
});

/**
 * Update an item
 * PUT /items/:itemId
 */
export const updateItem = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const itemId = req.params.itemId as string;
    const dto = UpdateItemSchema.parse(req.body);

    const result = await menuService.updateItem(hotelId, itemId, dto, getAuditContext(req));

    if (!result.success) {
        return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: "Item updated successfully",
        data: result.data,
    });
});

/**
 * Toggle item active status
 * PUT /items/:itemId/toggle
 */
export const toggleItem = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const itemId = req.params.itemId as string;

    const result = await menuService.toggleItem(hotelId, itemId, getAuditContext(req));

    if (!result.success) {
        return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        message: result.message,
        data: { isActive: result.isActive },
    });
});

// ==================== VARIANT CONTROLLERS ====================

/**
 * Get item by ID with full detail (variants, suggested items, category) for edit page
 * GET /items/:itemId
 */
export const getItemDetail = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const itemId = req.params.itemId as string;

    const result = await menuService.getItemDetail(hotelId, itemId);

    if (!result.success) {
        return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.data,
    });
});

/**
 * Get variants for an item
 * GET /items/:itemId/variants
 */
export const getVariants = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const itemId = req.params.itemId as string;

    const result = await menuService.getVariants(hotelId, itemId);

    if (!result.success) {
        return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.data,
    });
});

// ==================== FULL MENU CONTROLLERS ====================

/**
 * Get full menu with nested structure (super-search).
 * GET /menu-items?search=...&categoryIds=...&minPrice=...&maxPrice=...&type=...&isPopular=...&activeOnly=...
 */
export const  getFullMenu = asyncHandler(async (req: Request, res: Response) => {
    const hotelId = getHotelIdFromContext(req);
    const parsed = GetFullMenuValidation.parse({ query: req.query });

    const result = await menuService.getFullMenu(hotelId, parsed.query);

    if (!result.success) {
        return sendServiceError(res, 500, result.message ?? "Internal server error", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.data,
    });
});

// ==================== USER MENU (CUSTOMER-FACING) ====================

/**
 * Get menu for customer. hotelId from query or cookie customer_room_hotel_id.
 * No staff permission required; used by customer app (e.g. after room scan).
 */
export const getMenuForUser = asyncHandler(async (req: Request, res: Response) => {
    GetUserMenuValidation.parse({ query: req.query });
    const hotelId =
        (req.query.hotelId as string | undefined) ||
        (req.cookies?.customer_room_hotel_id as string | undefined);
    if (!hotelId) {
        return sendServiceError(
            res,
            400,
            "Hotel context required: provide hotelId query or customer_room_hotel_id cookie",
            { instance: req.originalUrl }
        );
    }

    const tzResult = await hospitalityService.getHotelTimezone(hotelId);
    if (!tzResult.success) {
        return sendServiceError(res, 404, tzResult.message ?? "Hotel not found", { instance: req.originalUrl });
    }

    const menuResult = await menuService.getMenuForUser(hotelId, tzResult.data!);
    if (!menuResult.success) {
        return sendServiceError(res, 500, menuResult.message ?? "Failed to load menu", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: menuResult.data,
    });
});

/**
 * Item detail for customer (add-to-cart dialog). Protected; hotelId from query or cookie.
 */
export const getItemDetailForUser = asyncHandler(async (req: Request, res: Response) => {
    GetItemDetailForUserValidation.parse({ params: req.params, query: req.query });
    const itemId = req.params.itemId as string;
    const hotelId =
        (req.query.hotelId as string | undefined) ||
        (req.cookies?.customer_room_hotel_id as string | undefined);
    if (!hotelId) {
        return sendServiceError(
            res,
            400,
            "Hotel context required: provide hotelId query or customer_room_hotel_id cookie",
            { instance: req.originalUrl }
        );
    }

    const tzResult = await hospitalityService.getHotelTimezone(hotelId);
    if (!tzResult.success) {
        return sendServiceError(res, 404, tzResult.message ?? "Hotel not found", { instance: req.originalUrl });
    }

    const result = await menuService.getItemDetailForUser(hotelId, itemId, tzResult.data!);
    if (!result.success) {
        return sendServiceError(res, 404, result.message ?? "Item not found", { instance: req.originalUrl });
    }

    return res.json({
        success: true,
        data: result.data,
    });
});


