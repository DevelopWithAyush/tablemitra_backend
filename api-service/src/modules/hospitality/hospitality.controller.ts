import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendServiceError } from "../../utils/error-response.js";
import { IJwtPayload } from "../auth/auth.types.js";
import hospitalityService from "./hospitality.service.js";
import logger from "../../helpers/logger/index.js";
import type { HospitalityAuditContext, CustomerHomeResponse } from "./hospitality.types.js";
import type { ActorRole } from "../audit/audit.types.js";

function getAuditContext(req: Request): HospitalityAuditContext {
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

class HospitalityController {

    // ==================== Sales Panel APIs ====================

    /**
     * Onboard Chain + Founder (Sales)
     * POST /api/sales/hospitality/chains
     */
    onboardChain = asyncHandler(async (req: Request, res: Response) => {
        const app = req.params.app as string 
        const user = (req as any).user as IJwtPayload;
        const { 
            name, description, settings,
            founderPhone, founderName, founderEmail, founderDesignation 
        } = req.body;

        const result = await hospitalityService.onboardChainWithFounder(
            {
                chainName: name,
                chainDescription: description,
                chainSettings: settings,
                founderPhone,
                founderName,
                founderEmail,
                founderDesignation,
            },
            user.sub,
            getAuditContext(req)
        );

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(201).json({
            success: true,
            message: "Chain onboarded successfully",
            data: result.data,
        });
    });

    /**
     * Get all chains (Sales)
     * GET /api/sales/hospitality/chains
     */
    getAllChains = asyncHandler(async (req: Request, res: Response) => {
        const { page, limit, search, isActive } = req.query;

        const result = await hospitalityService.getAllChains({
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            search: search as string,
            isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    });

    /**
     * Get chain by ID (Sales/Founder)
     * GET /api/sales/hospitality/chains/:chainId
     */
    getChainById = asyncHandler(async (req: Request, res: Response) => {
        const chainId = typeof req.params.chainId === "string" ? req.params.chainId : req.params.chainId?.[0] ?? "";

        const result = await hospitalityService.getChainById(chainId);

        if (!result.success) {
            return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
        }

        return res.status(200).json({
            success: true,
            data: result.data,
        });
    });

    /**
     * Onboard Hotel + Manager (Sales)
     * POST /api/sales/hospitality/chains/:chainId/hotels
     */
    onboardHotel = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const chainId = typeof req.params.chainId === "string" ? req.params.chainId : req.params.chainId?.[0] ?? "";
        const {
            name, description, address, contact,
            businessDetails,
            managerPhone, managerName, managerEmail,
            totalRooms, settings, panelSettings,
        } = req.body;

        const result = await hospitalityService.onboardHotelWithManager(
            chainId,
            {
                name,
                description,
                address,
                contact,
                businessDetails,
                managerPhone,
                managerName,
                managerEmail,
                totalRooms,
                settings,
                panelSettings,
            },
            user.sub,
            getAuditContext(req)
        );

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(201).json({
            success: true,
            message: "Hotel onboarded successfully",
            data: result.data,
        });
    });

    /**
     * Get all hotels (Sales)
     * GET /api/sales/hospitality/hotels
     */
    getAllHotels = asyncHandler(async (req: Request, res: Response) => {
        const { page, limit, search, chainId, city, isActive } = req.query;

        const result = await hospitalityService.getAllHotels({
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            search: search as string,
            chainId: chainId as string,
            city: city as string,
            isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    });

    /**
     * Get hotel by ID (Sales/Founder)
     * GET /api/sales/hospitality/hotels/:hotelId
     */
    getHotelById = asyncHandler(async (req: Request, res: Response) => {
        const hotelId = typeof req.params.hotelId === "string" ? req.params.hotelId : req.params.hotelId?.[0] ?? "";

        const result = await hospitalityService.getHotelById(hotelId);

        if (!result.success) {
            return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
        }

        return res.status(200).json({
            success: true,
            data: result.data,
        });
    });

    // ==================== Founder Panel APIs ====================

    /**
     * Create new chain (Founder)
     * POST /api/founder/hospitality/chains
     */
    founderCreateChain = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const { name, description, settings } = req.body;

        const result = await hospitalityService.founderCreateChain(
            user.sub,
            { name, description, settings },
            getAuditContext(req)
        );

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(201).json({
            success: true,
            message: "Chain created successfully",
            data: result.data,
        });
    });

    /**
     * Add chain member (Founder)
     * POST /api/founder/hospitality/chains/:chainId/members
     */
    addChainMember = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const chainId = typeof req.params.chainId === "string" ? req.params.chainId : req.params.chainId?.[0] ?? "";
        const { phone, name, email, designation, role } = req.body;

        // Verify founder has access to this chain
        const hasAccess = await hospitalityService.founderHasChainAccess(user.sub, chainId);
        if (!hasAccess) {
            return sendServiceError(res, 403, "You do not have access to this chain", { instance: req.originalUrl });
        }

        const result = await hospitalityService.addChainMember(
            chainId,
            { phone, name, email, designation, role },
            user.sub,
            getAuditContext(req)
        );

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(201).json({
            success: true,
            message: "Member added successfully",
            data: result.data,
        });
    });

    /**
     * Get chain members (Founder)
     * GET /api/founder/hospitality/chains/:chainId/members
     */
    getChainMembers = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const chainId = typeof req.params.chainId === "string" ? req.params.chainId : req.params.chainId?.[0] ?? "";

        // Verify founder has access
        const hasAccess = await hospitalityService.founderHasChainAccess(user.sub, chainId);
        if (!hasAccess) {
            return sendServiceError(res, 403, "You do not have access to this chain", { instance: req.originalUrl });
        }

        const result = await hospitalityService.getChainMembers(chainId);

        return res.status(200).json({
            success: true,
            data: result,
        });
    });

    /**
     * Founder onboard hotel
     * POST /api/founder/hospitality/hotels
     */
    founderOnboardHotel = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const {
            chainId,
            name, description, address, contact,
            businessDetails,
            managerPhone, managerName, managerEmail,
            totalRooms, settings, panelSettings,
        } = req.body;

        // Verify founder has access to the chain
        const hasAccess = await hospitalityService.founderHasChainAccess(user.sub, chainId);
        if (!hasAccess) {
            return sendServiceError(res, 403, "You do not have access to this chain", { instance: req.originalUrl });
        }

        const result = await hospitalityService.onboardHotelWithManager(
            chainId,
            {
                name,
                description,
                address,
                contact,
                businessDetails,
                managerPhone,
                managerName,
                managerEmail,
                totalRooms,
                settings,
                panelSettings,
            },
            user.sub,
            getAuditContext(req)
        );

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(201).json({
            success: true,
            message: "Hotel onboarded successfully",
            data: result.data,
        });
    });

    /**
     * Get hotels by current chain context (Founder)
     * GET /api/founder/hospitality/hotels
     */
    getFounderHotels = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const { page, limit, search } = req.query;

        // Get chain from JWT context
        const chainId = user.ctx?.id;
        if (!chainId) {
            return sendServiceError(res, 400, "No chain context found. Please switch to a chain first.", { instance: req.originalUrl });
        }

        const result = await hospitalityService.getHotelsByChainId(chainId, {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            search: search as string,
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    });

    // ==================== Staff Management APIs ====================

    /**
     * Onboard staff (Founder/Manager/Sales)
     * POST /api/:app/hospitality/hotels/:hotelId/staff
     */
    onboardStaff = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const hotelId = typeof req.params.hotelId === "string" ? req.params.hotelId : req.params.hotelId?.[0] ?? "";
        const { phone, name, email, designation } = req.body;

        const result = await hospitalityService.onboardStaff(
            hotelId,
            { phone, name, email, designation },
            user.sub,
            getAuditContext(req)
        );

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(201).json({
            success: true,
            message: "Staff onboarded successfully",
            data: result.data,
        });
    });

    /**
     * Get staff by hotel
     * GET /api/:app/hospitality/hotels/:hotelId/staff
     */
    getHotelStaff = asyncHandler(async (req: Request, res: Response) => {
        const hotelId = typeof req.params.hotelId === "string" ? req.params.hotelId : req.params.hotelId?.[0] ?? "";
        const { page, limit, search, designation } = req.query;

        const result = await hospitalityService.getStaffByHotelId(hotelId, {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            search: search as string,
            designation: designation as string,
        });

        return res.status(200).json({
            success: true,
            data: result,
        });
    });

    // ==================== Room Session (Check-in) APIs ====================

    /**
     * Check in guest(s) to a room (frontdesk). Supports multiple guests; name and phone are optional per guest.
     * POST /api/:app/hospitality/hotels/:hotelId/room-sessions/check-in
     */
    checkInGuest = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const hotelId = req.params.hotelId as string;
        const { roomNumber, guests } = req.body;

        const result = await hospitalityService.checkInGuest(
            hotelId,
            { roomNumber, guests },
            user.sub,
            getAuditContext(req)
        );

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(201).json({
            success: true,
            message: "Guest checked in successfully",
            data: result.data,
        });
    });

    /**
     * Customer app home: hotel context from room cookies.
     * GET /api/v1/customer/hospitality/home (auth required). Only for app=customer.
     * If no customer_room_hotel_id cookie → requiresScan: true (ask user to scan room QR).
     */
    getCustomerHomeContext = asyncHandler(async (req: Request, res: Response) => {
        const app = req.params.app as string;
        if (app !== "customer") {
            return sendServiceError(res, 404, "Not found", { instance: req.originalUrl });
        }

        const hotelId = req.cookies?.customer_room_hotel_id as string | undefined;
        const roomNumber = (req.cookies?.customer_room_room_number as string) ?? "";

        if (!hotelId) {
            const response: CustomerHomeResponse = {
                requiresScan: true,
                message: "Please scan room QR code",
                data: null,
            };
            return res.status(200).json({ success: true, ...response }); 
            
        }

        const result = await hospitalityService.getHotelContextForCustomer(hotelId);
        if (!result.success || !result.data) {
            return sendServiceError(res, 404, result.message ?? "Hotel not found", { instance: req.originalUrl });
        }

        const response: CustomerHomeResponse = {
            requiresScan: false,
            data: {
                roomNumber,
                name: result.data.name,
                logo: result.data.logo,
                address: result.data.address,
                phone: result.data.phone,
                currency: result.data.currency,
                timezone: result.data.timezone,
                taxSettings: result.data.taxSettings,
            },
        };
        return res.status(200).json({ success: true, ...response });
    });
}

export default new HospitalityController();
