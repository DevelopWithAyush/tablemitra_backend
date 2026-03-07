import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import hospitalityController from "./hospitality.controller.js";
import {
    OnboardChainSchema,
    OnboardHotelSchema,
    FounderOnboardHotelSchema,
    CreateChainSchema,
    AddChainMemberSchema,
    OnboardStaffSchema,
    CheckInGuestSchema,
    ChainIdParamSchema,
    HotelIdParamSchema,
} from "./validator/hospitality.validator.js";

// ==================== Hospitality Routes ====================

const hospitalityRoutes = Router({ mergeParams: true });

// Auth middleware - uses req.params.app
hospitalityRoutes.use(authMiddleware);

// ==================== Customer app home (hotel context from room cookies) ====================
// Only for app=customer; returns requiresScan if no room scanned. No staff permission.
hospitalityRoutes.get("/home", hospitalityController.getCustomerHomeContext);

// ==================== Chain Routes ====================

// Sales: Onboard chain with founder
hospitalityRoutes.post(
    "/chains",
    requirePermissions(["CREATE_CHAIN"], "all", false),
    validate(OnboardChainSchema),
    hospitalityController.onboardChain
);

// All: Get all chains
hospitalityRoutes.get(
    "/chains",
    requirePermissions(["VIEW_CHAIN"], "all", false),
    hospitalityController.getAllChains
);

// All: Get chain by ID
hospitalityRoutes.get(
    "/chains/:chainId",
    requirePermissions(["VIEW_CHAIN", "VIEW_HOTEL"], "any", false),
    validate(ChainIdParamSchema),
    hospitalityController.getChainById
);



// create api to get the all chain on the logged in founder


// Founder: Create new chain
hospitalityRoutes.post(
    "/chains/new",
    requirePermissions(["CREATE_CHAIN"], "all", false),
    validate(CreateChainSchema),
    hospitalityController.founderCreateChain
);

// ==================== Chain Member Routes ====================

// Founder: Add chain member
hospitalityRoutes.post(
    "/chains/:chainId/members",
    requirePermissions(["ADD_CHAIN_MEMBER", "VIEW_CHAIN_MEMBERS"], "any", true),
    validate(AddChainMemberSchema),
    hospitalityController.addChainMember
);

// Founder: Get chain members
hospitalityRoutes.get(
    "/chains/:chainId/members",
    requirePermissions(["VIEW_CHAIN_MEMBERS"], "all", true),
    validate(ChainIdParamSchema),
    hospitalityController.getChainMembers
);

// ==================== Hotel Routes ====================

// Sales: Onboard hotel under chain
hospitalityRoutes.post(
    "/chains/:chainId/hotels",
    requirePermissions(["ONBOARD_HOTEL"], "all", false),
    validate(OnboardHotelSchema),
    hospitalityController.onboardHotel
);

// Founder: Onboard hotel (from body chainId)
hospitalityRoutes.post(
    "/hotels",
    requirePermissions(["ONBOARD_HOTEL"], "all", true),
    validate(FounderOnboardHotelSchema),
    hospitalityController.founderOnboardHotel
);

// All: Get all hotels
hospitalityRoutes.get(
    "/hotels",
    requirePermissions(["VIEW_HOTEL"], "all", false),
    hospitalityController.getAllHotels
);

// Founder: Get hotels for current chain context
hospitalityRoutes.get(
    "/my-hotels",
    hospitalityController.getFounderHotels
);

// All: Get hotel by ID
hospitalityRoutes.get(
    "/hotels/:hotelId",
    requirePermissions(["VIEW_HOTEL"], "all", false),
    validate(HotelIdParamSchema),
    hospitalityController.getHotelById
);

// ==================== Staff Routes ====================

// Onboard staff
hospitalityRoutes.post(
    "/hotels/:hotelId/staff",
    requirePermissions(["CREATE_STAFF"], "all", true),
    validate(OnboardStaffSchema),
    hospitalityController.onboardStaff
);

// Get staff by hotel
hospitalityRoutes.get(
    "/hotels/:hotelId/staff",
    requirePermissions(["VIEW_STAFF"], "all", true),
    validate(HotelIdParamSchema),
    hospitalityController.getHotelStaff
);

// ==================== Room Session (Check-in) Routes ====================

// Frontdesk: Check in guest to a room
hospitalityRoutes.post(
    "/hotels/:hotelId/room-sessions/check-in",
    requirePermissions(["CHECK_IN_GUEST"], "all", true),
    validate(CheckInGuestSchema),
    hospitalityController.checkInGuest
); 



export default hospitalityRoutes;
