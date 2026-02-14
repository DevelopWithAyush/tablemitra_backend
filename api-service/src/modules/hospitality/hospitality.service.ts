import { ClientSession, Types } from "mongoose";
import { runInTransaction } from "../../infra/db/transaction.js";
import authService from "../auth/auth.service.js";
import { qrCodeService } from "../qr-code/qr-code.service.js";
import Chain from "./db/chain.model.js";
import ChainMembership from "./db/chain-membership.model.js";
import Founder from "./db/founder.model.js";
import Hotel from "./db/hotel.model.js";
import HotelStaff from "./db/hotel-staff.model.js";
import RoomSession from "./db/room_session.js";
import {
    ServiceResult,
    OnboardChainResult,
    OnboardHotelResult,
    AddMemberResult,
    OnboardStaffResult,
    CheckInGuestResult,
    ChainListItem,
    HotelListItem,
    StaffListItem,
    ChainMemberListItem,
    HospitalityAuditContext,
} from "./hospitality.types.js";
import { publishAuditEvent } from "../audit/audit.publisher.js";
import logger from "../../helpers/logger/index.js";

// ==================== Helper Functions ====================

const generateSlug = (name: string): string => {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
};

const generateEmployeeCode = async (prefix: string = "TMH"): Promise<string> => {
    const lastStaff = await HotelStaff.findOne()
        .sort({ createdAt: -1 })
        .select("employeeCode")
        .lean();

    let nextNumber = 1;
    if (lastStaff?.employeeCode) {
        const match = lastStaff.employeeCode.match(/(\d+)$/);
        if (match) {
            nextNumber = parseInt(match[1], 10) + 1;
        }
    }

    return `${prefix}-${nextNumber.toString().padStart(5, "0")}`;
};

const generateUniqueSlug = async (baseName: string): Promise<string> => {
    let slug = generateSlug(baseName);
    let counter = 1;

    while (await Hotel.exists({ slug })) {
        slug = `${generateSlug(baseName)}-${counter}`;
        counter++;
    }

    return slug;
};

// ==================== Types ====================

interface ProfileResult {
    success: true;
    profile: Record<string, unknown>;
}

interface ProfileFailure {
    success: false;
    message: string;
}

type ProfileFetchResult = ProfileResult | ProfileFailure;

interface ChainInfo {
    chainId: string;
    chainName: string;
    chainLogo?: string;
    role: string;
    hotelCount: number;
}

interface FounderChainsResult {
    success: true;
    chains: ChainInfo[];
    defaultChainId?: string;
}

interface FounderChainsFailure {
    success: false;
    message: string;
}

type GetFounderChainsResult = FounderChainsResult | FounderChainsFailure;

// ==================== Service Class ====================

class HospitalityService {

    // ==================== Profile Methods ====================

    getFounderProfileByUserId = async (userId: string): Promise<ProfileFetchResult> => {
        // Profile only checks isActive; deletion/block status is in UserRole
        const profile = await Founder.findOne({ userId, isActive: true })
            .select("-__v")
            .populate("profilePicture", "url type")
            .lean();

        if (!profile) {
            return { success: false, message: "Founder profile not found" };
        }

        const memberships = await ChainMembership.find({
            founderId: profile._id,
            isActive: true,
            isDeleted: false, // ChainMembership can be deleted when founder leaves chain
        })
            .populate("chainId", "name logo")
            .lean();

        const chains = memberships.map(m => ({
            chainId: (m.chainId as unknown as { _id: Types.ObjectId; name: string })._id.toString(),
            chainName: (m.chainId as unknown as { name: string }).name,
            role: m.role,
            joinedAt: m.joinedAt,
        }));

        // Get user phone from authService
        const user = await authService.getUserById(userId);

        return {
            success: true,
            profile: { ...profile, chains, phone: user?.phone, role: "FOUNDER" },
        };
    };

    getFounderChains = async (userId: string): Promise<GetFounderChainsResult> => {
        const founder = await Founder.findOne({ userId, isActive: true }).lean();
        if (!founder) {
            return { success: false, message: "Founder profile not found" };
        }

        const memberships = await ChainMembership.find({
            founderId: founder._id,
            isActive: true,
            isDeleted: false, // ChainMembership can be deleted when founder leaves chain
        })
            .populate("chainId", "name logo")
            .sort({ joinedAt: 1 })
            .lean();

        if (memberships.length === 0) {
            return { success: false, message: "No chains found for this founder" };
        }

        const chains: ChainInfo[] = await Promise.all(
            memberships.map(async (m) => {
                const chain = m.chainId as unknown as { _id: Types.ObjectId; name: string; logo?: Types.ObjectId };
                const hotelCount = await Hotel.countDocuments({ chainId: chain._id, isDeleted: false });
                return {
                    chainId: chain._id.toString(),
                    chainName: chain.name,
                    chainLogo: chain.logo?.toString(),
                    role: m.role,
                    hotelCount,
                };
            })
        );

        return { success: true, chains, defaultChainId: chains[0]?.chainId };
    };

    founderHasChainAccess = async (userId: string, chainId: string): Promise<boolean> => {
        const founder = await Founder.findOne({ userId, isActive: true }).lean();
        if (!founder) return false;

        const membership = await ChainMembership.findOne({
            founderId: founder._id,
            chainId,
            isActive: true,
            isDeleted: false,
        }).lean();

        return !!membership;
    };

    getFounderDefaultChainId = async (userId: string): Promise<string | null> => {
        const founder = await Founder.findOne({ userId, isActive: true }).lean();
        if (!founder) return null;

        const membership = await ChainMembership.findOne({
            founderId: founder._id,
            isActive: true,
            isDeleted: false,
        })
            .sort({ joinedAt: 1 })
            .lean();

        return membership?.chainId.toString() || null;
    };

    getStaffProfileByUserId = async (userId: string): Promise<ProfileFetchResult> => {
        // Profile only checks isActive; deletion/block status is in UserRole
        const profile = await HotelStaff.findOne({ userId, isActive: true })
            .select("-__v")
            .populate("profilePicture", "url type")
            .populate("currentHotelId", "name address logo chainId")
            .lean();

        if (!profile) {
            return { success: false, message: "Staff profile not found" };
        }

        const user = await authService.getUserById(userId);

        return {
            success: true,
            profile: { ...profile, phone: user?.phone, role: profile.designation }
        };
    };

    getStaffHotelId = async (userId: string): Promise<string | null> => {
        // Profile only checks isActive; deletion/block status is in UserRole
        const staff = await HotelStaff.findOne({ userId, isActive: true })
            .select("currentHotelId")
            .lean();

        return staff?.currentHotelId?.toString() || null;
    };

    // ==================== Onboarding Methods ====================

    /**
     * Onboard Chain + Founder (Sales Panel)
     */
    onboardChainWithFounder = async (
        data: {
            chainName: string;
            chainDescription?: string;
            chainSettings?: Record<string, unknown>;
            founderPhone: string;
            founderName: string;
            founderEmail?: string;
            founderDesignation?: string;
        },
        createdBy: string,
        auditContext?: HospitalityAuditContext
    ): Promise<ServiceResult<OnboardChainResult>> => {
        const result = await runInTransaction(async (session: ClientSession) => {
            // Check if chain name already exists
            const existingChain = await Chain.findOne({ name: data.chainName }).session(session);
            if (existingChain) {
                return { success: false, message: "Chain with this name already exists" };
            }

            // Get or create user via authService
            const userResult = await authService.getOrCreateUser(data.founderPhone, session);
            const isNewUser = userResult.isNewUser;
            const userId = userResult.userId;

            // Check if founder profile exists
            let founder = await Founder.findOne({ userId }).session(session);
            let isNewFounder = false;

            if (!founder) {
                const [newFounder] = await Founder.create([{
                    userId,
                    name: data.founderName,
                    email: data.founderEmail,
                    phone: data.founderPhone,
                    designation: data.founderDesignation,
                }], { session });
                founder = newFounder;
                isNewFounder = true;
            }

            // Create chain
            const [chain] = await Chain.create([{
                name: data.chainName,
                description: data.chainDescription,
                settings: data.chainSettings,
                createdBy,
            }], { session });

            // Create chain membership
            await ChainMembership.create([{
                founderId: founder._id,
                chainId: chain._id,
                role: "OWNER",
                invitedBy: createdBy,
            }], { session });

            // Assign FOUNDER role with CHAIN context via authService
            await authService.assignRoleToUser(
                userId,
                "FOUNDER",
                "CHAIN",
                chain._id.toString(),
                session
            );

            return {
                success: true,
                data: {
                    chainId: chain._id.toString(),
                    founderId: founder._id.toString(),
                    founderUserId: userId,
                    isNewFounder: isNewFounder || isNewUser,
                },
            };
        });

        if (result.success && result.data != null && auditContext) {
            publishAuditEvent(
                "CHAIN_CREATED",
                "CHAIN",
                result.data.chainId,
                auditContext.actor,
                {
                    context: { ...auditContext.context, chainId: result.data.chainId },
                    newData: { name: data.chainName, founderId: result.data.founderId },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }
        return result as ServiceResult<OnboardChainResult>;
    };

    /**
     * Onboard Hotel + Manager
     */
    onboardHotelWithManager = async (
        chainId: string,
        data: {
            name: string;
            description?: string;
            address: {
                street?: string;
                city: string;
                state: string;
                country?: string;
                pincode: string;
                coordinates?: { lat?: number; lng?: number };
            };
            contact: {
                phone: string;
                email: string;
                website?: string;
            };
            managerPhone: string;
            managerName: string;
            managerEmail?: string;
            totalRooms?: number;
            settings?: Record<string, unknown>;
            panelSettings?: Record<string, unknown>;
        },
        createdBy: string,
        auditContext?: HospitalityAuditContext
    ): Promise<ServiceResult<OnboardHotelResult>> => {
        const result = await runInTransaction(async (session: ClientSession) => {
            // Check chain exists
            const chain = await Chain.findById(chainId).session(session);
            if (!chain || chain.isDeleted) {
                return { success: false, message: "Chain not found" };
            }

            // Generate unique slug
            const slug = await generateUniqueSlug(data.name);

            // Create hotel
            const [hotel] = await Hotel.create([{
                chainId,
                name: data.name,
                slug,
                description: data.description,
                address: {
                    ...data.address,
                    country: data.address.country || "India",
                },
                contact: data.contact,
                totalRooms: data.totalRooms || 0,
                settings: data.settings,
                panelSettings: data.panelSettings,
            }], { session });

            // Get or create manager user via authService
            const userResult = await authService.getOrCreateUser(data.managerPhone, session);
            const isNewUser = userResult.isNewUser;
            const userId = userResult.userId;

            // Check if user is already staff
            const existingStaff = await HotelStaff.findOne({ userId }).session(session);
            if (existingStaff) {
                return { success: false, message: "This phone number is already registered as hotel staff" };
            }

            // Generate employee code
            const employeeCode = await generateEmployeeCode("TMH");

            // Create manager profile
            const [manager] = await HotelStaff.create([{
                userId,
                name: data.managerName,
                phone: data.managerPhone,
                email: data.managerEmail,
                employeeCode,
                designation: "MANAGER",
                currentHotelId: hotel._id,
            }], { session });

            // Assign MANAGER role with HOTEL context via authService
            await authService.assignRoleToUser(
                userId,
                "MANAGER",
                "HOTEL",
                hotel._id.toString(),
                session
            );

            // Create default QR set for the hotel
            const qrSetResult = await qrCodeService.createDefaultQrSetForHotel({
                hotelId: hotel._id.toString(),
                session,
            });

            if (!qrSetResult.success) {
                throw new Error(`Failed to create QR set: ${qrSetResult.message}`);
            }

            return {
                success: true,
                data: {
                    hotelId: hotel._id.toString(),
                    managerId: manager._id.toString(),
                    managerUserId: userId,
                    isNewManager: isNewUser,
                    qrSetId: qrSetResult.data?.qrSetId,
                },
            };
        });

        if (result.success && result.data != null && auditContext) {
            publishAuditEvent(
                "HOTEL_CREATED",
                "HOTEL",
                result.data.hotelId,
                auditContext.actor,
                {
                    context: {
                        ...auditContext.context,
                        chainId,
                        hotelId: result.data.hotelId,
                    },
                    newData: { name: data.name, chainId, managerId: result.data.managerId },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }
        return result as ServiceResult<OnboardHotelResult>;
    };

    /**
     * Founder creates new chain (from Founder Panel)
     */
    founderCreateChain = async (
        userId: string,
        data: {
            name: string;
            description?: string;
            settings?: Record<string, unknown>;
        },
        auditContext?: HospitalityAuditContext
    ): Promise<ServiceResult<{ chainId: string }>> => {
        const result = await runInTransaction(async (session: ClientSession) => {
            // Check if chain name exists
            const existingChain = await Chain.findOne({ name: data.name }).session(session);
            if (existingChain) {
                return { success: false, message: "Chain with this name already exists" };
            }

            // Get founder profile (check isActive only, block/delete in UserRole)
            const founder = await Founder.findOne({ userId, isActive: true }).session(session);
            if (!founder) {
                return { success: false, message: "Founder profile not found or inactive" };
            }

            // Create chain
            const [chain] = await Chain.create([{
                name: data.name,
                description: data.description,
                settings: data.settings,
                createdBy: userId,
            }], { session });

            // Create membership
            await ChainMembership.create([{
                founderId: founder._id,
                chainId: chain._id,
                role: "OWNER",
                invitedBy: userId,
            }], { session });

            // Assign FOUNDER role with new CHAIN context via authService
            await authService.assignRoleToUser(
                userId,
                "FOUNDER",
                "CHAIN",
                chain._id.toString(),
                session
            );

            return {
                success: true,
                data: { chainId: chain._id.toString() },
            };
        });

        if (result.success && result.data != null && auditContext) {
            publishAuditEvent(
                "CHAIN_CREATED",
                "CHAIN",
                result.data.chainId,
                auditContext.actor,
                {
                    context: { ...auditContext.context, chainId: result.data.chainId },
                    newData: { name: data.name },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }
        return result as ServiceResult<{ chainId: string }>;
    };

    /**
     * Add chain member (CO_OWNER/DIRECTOR/PARTNER) - from Founder Panel
     */
    addChainMember = async (
        chainId: string,
        data: {
            phone: string;
            name: string;
            email?: string;
            designation?: string;
            role: "CO_OWNER" | "DIRECTOR" | "PARTNER";
        },
        invitedBy: string,
        auditContext?: HospitalityAuditContext
    ): Promise<ServiceResult<AddMemberResult>> => {
        const result = await runInTransaction(async (session: ClientSession) => {
            // Check chain exists
            const chain = await Chain.findById(chainId).session(session);
            if (!chain || chain.isDeleted) {
                return { success: false, message: "Chain not found" };
            }

            // Get or create user via authService
            const userResult = await authService.getOrCreateUser(data.phone, session);
            const isNewUser = userResult.isNewUser;
            const userId = userResult.userId;

            // Check if founder profile exists
            let founder = await Founder.findOne({ userId }).session(session);
            let isNewFounder = false;

            if (!founder) {
                const [newFounder] = await Founder.create([{
                    userId,
                    name: data.name,
                    email: data.email,
                    phone: data.phone,
                    designation: data.designation,
                }], { session });
                founder = newFounder;
                isNewFounder = true;
            }

            // Check if already member
            const existingMembership = await ChainMembership.findOne({
                founderId: founder._id,
                chainId,
            }).session(session);

            if (existingMembership) {
                return { success: false, message: "This person is already a member of this chain" };
            }

            // Create membership
            const [membership] = await ChainMembership.create([{
                founderId: founder._id,
                chainId,
                role: data.role,
                invitedBy,
            }], { session });

            // Assign FOUNDER role with CHAIN context via authService
            await authService.assignRoleToUser(
                userId,
                "FOUNDER",
                "CHAIN",
                chainId,
                session
            );

            return {
                success: true,
                data: {
                    founderId: founder._id.toString(),
                    membershipId: membership._id.toString(),
                    isNewFounder: isNewFounder || isNewUser,
                },
            };
        });

        if (result.success && result.data != null && auditContext) {
            publishAuditEvent(
                "CHAIN_UPDATED",
                "CHAIN",
                chainId,
                auditContext.actor,
                {
                    context: { ...auditContext.context, chainId },
                    newData: { memberAdded: data.role, founderId: result.data.founderId },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }
        return result as ServiceResult<AddMemberResult>;
    };

    /**
     * Onboard staff (FRONTDESK, KITCHEN, ROOM_SERVICE, HOUSEKEEPING)
     */
    onboardStaff = async (
        hotelId: string,
        data: {
            phone: string;
            name: string;
            email?: string;
            designation: "FRONTDESK" | "KITCHEN" | "ROOM_SERVICE" | "HOUSEKEEPING";
        },
        createdBy: string,
        auditContext?: HospitalityAuditContext
    ): Promise<ServiceResult<OnboardStaffResult>> => {
        const result = await runInTransaction(async (session: ClientSession) => {
            // Check hotel exists
            const hotel = await Hotel.findById(hotelId).session(session);
            if (!hotel || hotel.isDeleted) {
                return { success: false, message: "Hotel not found" };
            }

            // Get or create user via authService
            const userResult = await authService.getOrCreateUser(data.phone, session);
            const isNewUser = userResult.isNewUser;
            const userId = userResult.userId;

            // Check if already staff
            const existingStaff = await HotelStaff.findOne({ userId }).session(session);
            if (existingStaff) {
                return { success: false, message: "This phone number is already registered as hotel staff" };
            }

            // Generate employee code
            const employeeCode = await generateEmployeeCode("TMH");

            // Create staff profile
            const [staff] = await HotelStaff.create([{
                userId,
                name: data.name,
                phone: data.phone,
                email: data.email,
                employeeCode,
                designation: data.designation,
                currentHotelId: hotelId,
            }], { session });

            // Map designation to role key
            const roleKey = data.designation === "ROOM_SERVICE" ? "ROOM_SERVICE" : data.designation;

            // Assign role with HOTEL context via authService
            await authService.assignRoleToUser(
                userId,
                roleKey,
                "HOTEL",
                hotelId,
                session
            );

            return {
                success: true,
                data: {
                    staffId: staff._id.toString(),
                    userId,
                    employeeCode,
                    isNewUser,
                },
            };
        });

        if (result.success && result.data != null && auditContext) {
            publishAuditEvent(
                "STAFF_CREATED",
                "STAFF",
                result.data.staffId,
                auditContext.actor,
                {
                    context: { ...auditContext.context, hotelId },
                    newData: {
                        name: data.name,
                        designation: data.designation,
                        employeeCode: result.data.employeeCode,
                    },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }
        return result as ServiceResult<OnboardStaffResult>;
    };

    // ==================== Room Session (for QR / occupancy) ====================

    /**
     * Returns room numbers that have an active session (occupied).
     * Used by qr-code module to enrich room list with roomStatus (OCCUPIED/VACANT).
     */
    getOccupiedRoomNumbers = async (hotelId: string): Promise<string[]> => {
        const roomNumbers = await RoomSession.distinct("roomNumber", {
            hotelId: new Types.ObjectId(hotelId),
            status: "ACTIVE",
        });
        return roomNumbers;
    };

    /**
     * Returns occupied rooms with their session stats (for QR room list).
     * Used by qr-code module when type=ROOM to attach stats to OCCUPIED rooms.
     */
    getOccupiedRoomsWithStats = async (
        hotelId: string
    ): Promise<Array<{ roomNumber: string; stats: { totalOrders: number; totalFoodOrders: number; totalServiceRequests: number; totalSpend: number } }>> => {
        const sessions = await RoomSession.find({
            hotelId: new Types.ObjectId(hotelId),
            status: "ACTIVE",
        })
            .select("roomNumber stats")
            .lean();

        return sessions.map((s) => ({
            roomNumber: s.roomNumber,
            stats: {
                totalOrders: s.stats?.totalOrders ?? 0,
                totalFoodOrders: s.stats?.totalFoodOrders ?? 0,
                totalServiceRequests: s.stats?.totalServiceRequests ?? 0,
                totalSpend: s.stats?.totalSpend ?? 0,
            },
        }));
    };

    /**
     * Check in guest(s) to a room (frontdesk). Creates an active room session.
     * Supports multiple guests; each guest can have optional name and/or phone.
     */
    checkInGuest = async (
        hotelId: string,
        data: { roomNumber: string; guests?: Array<{ name?: string; phone?: string }> },
        checkedInByUserId: string,
        auditContext?: HospitalityAuditContext
    ): Promise<ServiceResult<CheckInGuestResult>> => {
        const existingActive = await RoomSession.findOne({
            hotelId: new Types.ObjectId(hotelId),
            roomNumber: data.roomNumber.trim(),
            status: "ACTIVE",
        }).lean();

        if (existingActive) {
            return { success: false, message: "Room is already occupied" };
        }

        const roomExists = await qrCodeService.isValidRoomForHotel(hotelId, data.roomNumber.trim());
        if (!roomExists) {
            return { success: false, message: "Room does not exist for this hotel" };
        }

        const guests = (data.guests ?? []).map((g) => ({
            name: g.name?.trim() || undefined,
            phone: g.phone?.trim() || undefined,
        }));

        const [session] = await RoomSession.create([
            {
                hotelId: new Types.ObjectId(hotelId),
                roomNumber: data.roomNumber.trim(),
                status: "ACTIVE",
                checkedInBy: new Types.ObjectId(checkedInByUserId),
                metadata: {
                    guests,
                    guestCount: guests.length,
                },
            },
        ]);

        await qrCodeService.invalidateHotelQrCache(hotelId);

        if (auditContext) {
            publishAuditEvent(
                "GUEST_CHECKED_IN",
                "GUEST_SESSION",
                session._id.toString(),
                auditContext.actor,
                {
                    context: { ...auditContext.context, hotelId },
                    newData: { roomNumber: session.roomNumber, guests },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }

        return {
            success: true,
            data: {
                sessionId: session._id.toString(),
                hotelId,
                roomNumber: session.roomNumber,
                checkInAt: session.checkInAt,
                guests,
            },
        };
    };

    // ==================== List Methods ====================

    getAllChains = async (
        query: { page?: number; limit?: number; search?: string; isActive?: boolean }
    ): Promise<{ chains: ChainListItem[]; total: number; page: number; limit: number }> => {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;

        const filter: Record<string, unknown> = { isDeleted: false };
        if (query.search) {
            filter.name = { $regex: query.search, $options: "i" };
        }
        if (typeof query.isActive === "boolean") {
            filter.isActive = query.isActive;
        }

        const [chains, total] = await Promise.all([
            Chain.find(filter)
                .select("name logo description createdAt")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Chain.countDocuments(filter),
        ]);

        const chainsWithCounts = await Promise.all(
            chains.map(async (chain) => {
                const [hotelCount, founderCount] = await Promise.all([
                    Hotel.countDocuments({ chainId: chain._id, isDeleted: false }),
                    ChainMembership.countDocuments({ chainId: chain._id, isActive: true, isDeleted: false }),
                ]);
                return {
                    _id: chain._id.toString(),
                    name: chain.name,
                    logo: chain.logo?.toString(),
                    description: chain.description,
                    hotelCount,
                    founderCount,
                    createdAt: chain.createdAt,
                } as ChainListItem;
            })
        );

        return { chains: chainsWithCounts, total, page, limit };
    };

    getAllHotels = async (
        query: { page?: number; limit?: number; search?: string; chainId?: string; city?: string; isActive?: boolean }
    ): Promise<{ hotels: HotelListItem[]; total: number; page: number; limit: number }> => {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;

        const filter: Record<string, unknown> = { isDeleted: false };
        if (query.search) {
            filter.$or = [
                { name: { $regex: query.search, $options: "i" } },
                { "address.city": { $regex: query.search, $options: "i" } },
            ];
        }
        if (query.chainId) {
            filter.chainId = query.chainId;
        }
        if (query.city) {
            filter["address.city"] = { $regex: query.city, $options: "i" };
        }
        if (typeof query.isActive === "boolean") {
            filter.isActive = query.isActive;
        }

        const [hotels, total] = await Promise.all([
            Hotel.find(filter)
                .select("name slug logo chainId address.city address.state isActive createdAt")
                .populate("chainId", "name")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Hotel.countDocuments(filter),
        ]);

        const hotelsWithManager = await Promise.all(
            hotels.map(async (hotel) => {
                // Profile only checks isActive; deletion/block in UserRole
                const manager = await HotelStaff.findOne({
                    currentHotelId: hotel._id,
                    designation: "MANAGER",
                    isActive: true,
                }).select("name").lean();

                const chainData = hotel.chainId as unknown as { _id: Types.ObjectId; name: string };
                return {
                    _id: hotel._id.toString(),
                    name: hotel.name,
                    slug: hotel.slug,
                    logo: hotel.logo?.toString(),
                    chainId: chainData._id.toString(),
                    chainName: chainData?.name || "",
                    city: hotel.address?.city || "",
                    state: hotel.address?.state || "",
                    managerName: manager?.name,
                    isActive: hotel.isActive,
                    createdAt: hotel.createdAt,
                } as HotelListItem;
            })
        );

        return { hotels: hotelsWithManager, total, page, limit };
    };

    getHotelsByChainId = async (
        chainId: string,
        query: { page?: number; limit?: number; search?: string }
    ): Promise<{ hotels: HotelListItem[]; total: number; page: number; limit: number }> => {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;

        const filter: Record<string, unknown> = { chainId, isDeleted: false };
        if (query.search) {
            filter.name = { $regex: query.search, $options: "i" };
        }

        const [hotels, total] = await Promise.all([
            Hotel.find(filter)
                .select("name slug logo address.city address.state isActive createdAt")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Hotel.countDocuments(filter),
        ]);

        const chain = await Chain.findById(chainId).select("name").lean();

        const hotelsWithManager = await Promise.all(
            hotels.map(async (hotel) => {
                const manager = await HotelStaff.findOne({
                    currentHotelId: hotel._id,
                    designation: "MANAGER",
                    isActive: true,
                }).select("name").lean();

                return {
                    _id: hotel._id.toString(),
                    name: hotel.name,
                    slug: hotel.slug,
                    logo: hotel.logo?.toString(),
                    chainId,
                    chainName: chain?.name || "",
                    city: hotel.address?.city || "",
                    state: hotel.address?.state || "",
                    managerName: manager?.name,
                    isActive: hotel.isActive,
                    createdAt: hotel.createdAt,
                } as HotelListItem;
            })
        );

        return { hotels: hotelsWithManager, total, page, limit };
    };

    getStaffByHotelId = async (
        hotelId: string,
        query: { page?: number; limit?: number; search?: string; designation?: string }
    ): Promise<{ staff: StaffListItem[]; total: number; page: number; limit: number }> => {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;

        // Profile only checks isActive; deletion/block status is in UserRole
        const filter: Record<string, unknown> = { currentHotelId: hotelId, isActive: true };
        if (query.search) {
            filter.name = { $regex: query.search, $options: "i" };
        }
        if (query.designation) {
            filter.designation = query.designation;
        }

        const [staff, total] = await Promise.all([
            HotelStaff.find(filter)
                .select("name email employeeCode designation isActive joinedAt")
                .sort({ joinedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            HotelStaff.countDocuments(filter),
        ]);

        const hotel = await Hotel.findById(hotelId).select("name").lean();

        const staffList: StaffListItem[] = staff.map((s) => ({
            _id: s._id.toString(),
            name: s.name,
            email: s.email,
            employeeCode: s.employeeCode,
            designation: s.designation,
            hotelId,
            hotelName: hotel?.name || "",
            isActive: s.isActive,
            joinedAt: s.joinedAt,
        }));

        return { staff: staffList, total, page, limit };
    };

    getChainMembers = async (chainId: string): Promise<{ members: ChainMemberListItem[] }> => {
        const memberships = await ChainMembership.find({
            chainId,
            isDeleted: false,
        })
            .populate("founderId", "name email phone")
            .sort({ joinedAt: 1 })
            .lean();

        const members: ChainMemberListItem[] = memberships.map((m) => {
            const founder = m.founderId as unknown as { _id: Types.ObjectId; name?: string; email?: string; phone?: string };
            return {
                _id: m._id.toString(),
                founderId: founder._id.toString(),
                founderName: founder.name || "",
                founderEmail: founder.email,
                founderPhone: founder.phone,
                role: m.role,
                joinedAt: m.joinedAt,
                isActive: m.isActive,
            };
        });

        return { members };
    };

    // ==================== Single Get Methods ====================

    getChainById = async (chainId: string): Promise<ServiceResult<Record<string, unknown>>> => {
        const chain = await Chain.findOne({ _id: chainId, isDeleted: false })
            .populate("logo", "url type")
            .lean();

        if (!chain) {
            return { success: false, message: "Chain not found" };
        }

        const [hotelCount, founderCount] = await Promise.all([
            Hotel.countDocuments({ chainId, isDeleted: false }),
            ChainMembership.countDocuments({ chainId, isActive: true, isDeleted: false }),
        ]);

        return {
            success: true,
            data: { ...chain, hotelCount, founderCount },
        };
    };

    getHotelById = async (hotelId: string): Promise<ServiceResult<Record<string, unknown>>> => {
        const hotel = await Hotel.findOne({ _id: hotelId, isDeleted: false })
            .populate("chainId", "name logo")
            .populate("logo", "url type")
            .lean();

        if (!hotel) {
            return { success: false, message: "Hotel not found" };
        }

        const manager = await HotelStaff.findOne({
            currentHotelId: hotelId,
            designation: "MANAGER",
            isActive: true,
        }).select("name email phone employeeCode").lean();

        // Profile only checks isActive; deletion/block status is in UserRole
        const staffCount = await HotelStaff.countDocuments({
            currentHotelId: hotelId,
            isActive: true,
        });

        return {
            success: true,
            data: { ...hotel, manager, staffCount },
        };
    };
}

export default new HospitalityService();
