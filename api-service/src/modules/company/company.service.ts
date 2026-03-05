import { runInTransaction } from "../../infra/db/transaction.js";
import { getRedis } from "../../infra/redis/redis.js";
import authService from "../auth/auth.service.js";
import Admin from "./db/admin-profile.model.js";
import CustomerCare from "./db/customer-care-profile.model.js";
import SalesProfile from "./db/sales-profile.model.js";
import {
    CreateAdminDTO,
    UpdateAdminDTO,
    CreateCustomerCareDTO,
    UpdateCustomerCareDTO,
    CreateSalesDTO,
    UpdateSalesDTO,
    PaginationDTO,
    PaginatedResult,
    CreateResult,
    UpdateResult,
    DeleteResult,
    CompanyAuditContext,
} from "./company.types.js";
import { publishAuditEvent } from "../audit/audit.publisher.js";
import logger from "../../helpers/logger/index.js";

// Cache keys
const CACHE_KEYS = {
    ADMIN_LIST: "company:admins:list",
    ADMIN_BY_ID: (id: string) => `company:admins:${id}`,
    CUSTOMER_CARE_LIST: "company:customer-care:list",
    CUSTOMER_CARE_BY_ID: (id: string) => `company:customer-care:${id}`,
    SALES_LIST: "company:sales:list",
    SALES_BY_ID: (id: string) => `company:sales:${id}`,
};

const CACHE_TTL = 3600; // 1 hour

// Helper functions
const buildListCacheKey = (base: string, options: PaginationDTO): string => {
    const { page = 1, limit = 20, search = "", isActive } = options;
    return `${base}:${page}:${limit}:${search}:${isActive ?? "all"}`;
};

const invalidateListCache = async (pattern: string): Promise<void> => {
    const redis = getRedis();
    let cursor = "0";
    do {
        const result = await redis.scan(cursor, { MATCH: `${pattern}:*`, COUNT: 100 });
        cursor = String(result.cursor);
        if (result.keys.length > 0) {
            await redis.del(result.keys);
        }
    } while (cursor !== "0");
};

// Generate employee codes
const generateCustomerCareCode = async (): Promise<string> => {
    const lastRecord = await CustomerCare.findOne().sort({ createdAt: -1 }).select("employeeCode").lean();

    if (!lastRecord || !lastRecord.employeeCode) {
        return "TMC001";
    }

    const lastNumber = parseInt(lastRecord.employeeCode.replace("TMC", ""), 10);
    const nextNumber = lastNumber + 1;
    return `TMC${nextNumber.toString().padStart(3, "0")}`;
};

const generateSalesCode = async (): Promise<string> => {
    const lastRecord = await SalesProfile.findOne().sort({ createdAt: -1 }).select("employeeCode").lean();

    if (!lastRecord || !lastRecord.employeeCode) {
        return "TMS001";
    }

    const lastNumber = parseInt(lastRecord.employeeCode.replace("TMS", ""), 10);
    const nextNumber = lastNumber + 1;
    return `TMS${nextNumber.toString().padStart(3, "0")}`;
};

interface ProfileResult {
    success: true;
    profile: Record<string, unknown>;
}

interface ProfileFailure {
    success: false;
    message: string;
}

type ProfileFetchResult = ProfileResult | ProfileFailure;

class CompanyService {
    // ==================== ADMIN ====================

    getAdminProfileByUserId = async (userId: string): Promise<ProfileFetchResult> => {
        const profile = await Admin.findOne({ userId })
            .select("-__v")
            .populate("profilePicture", "url type")
            .lean();

        if (!profile) {
            return { success: false, message: "Admin profile not found" };
        }

        return { success: true, profile };
    };

    getAdmins = async (options: PaginationDTO): Promise<PaginatedResult<Record<string, unknown>>> => {
        const redis = getRedis();
        const cacheKey = buildListCacheKey(CACHE_KEYS.ADMIN_LIST, options);

        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const { page = 1, limit = 20, search, isActive } = options;
        const skip = (page - 1) * limit;

        const filter: Record<string, unknown> = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }
        if (isActive !== undefined) {
            filter.isActive = isActive;
        }

        const [admins, total] = await Promise.all([
            Admin.find(filter)
                .populate("profilePicture", "url type")
                .populate("userId", "phone")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Admin.countDocuments(filter),
        ]);

        const result = {
            data: admins,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
    };

    getAdminById = async (id: string): Promise<ProfileFetchResult> => {
        const redis = getRedis();
        const cacheKey = CACHE_KEYS.ADMIN_BY_ID(id);

        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const profile = await Admin.findById(id)
            .populate("profilePicture", "url type")
            .populate("userId", "phone")
            .lean();

        if (!profile) {
            return { success: false, message: "Admin not found" };
        }

        const result = { success: true as const, profile };
        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
    };

    createAdmin = async (dto: CreateAdminDTO, auditContext?: CompanyAuditContext): Promise<CreateResult> => {
        // Check if email already exists (read-only, outside transaction)
        const existingEmail = await Admin.findOne({ email: dto.email });
        if (existingEmail) {
            return { success: false, message: "Email already exists" };
        }

        // User creation and profile creation share the same transaction so that
        // a failure in Admin.create rolls back the User + UserRole writes too,
        // preventing a dangling user account with no admin profile.
        const admin = await runInTransaction(async (session) => {
            const userResult = await authService.createUserWithRole(dto.phone, "ADMIN", "GLOBAL", undefined, session);
            if (!userResult.success) throw new Error(userResult.message ?? "Failed to create user");

            const [created] = await Admin.create(
                [{ userId: userResult.userId, name: dto.name, email: dto.email }],
                { session }
            );
            return created;
        });

        await invalidateListCache(CACHE_KEYS.ADMIN_LIST);

        if (auditContext) {
            publishAuditEvent(
                "STAFF_CREATED",
                "ADMIN",
                admin._id.toString(),
                auditContext.actor,
                { context: auditContext.context, newData: { name: admin.name, email: admin.email } }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }

        return {
            success: true,
            profile: admin.toObject(),
        };
    };

    updateAdmin = async (id: string, dto: UpdateAdminDTO, auditContext?: CompanyAuditContext): Promise<UpdateResult> => {
        const admin = await Admin.findById(id);
        if (!admin) {
            return { success: false, message: "Admin not found" };
        }

        const previousData = { name: admin.name, email: admin.email, isActive: admin.isActive };

        if (dto.email && dto.email !== admin.email) {
            const existingEmail = await Admin.findOne({ email: dto.email, _id: { $ne: id } });
            if (existingEmail) {
                return { success: false, message: "Email already exists" };
            }
            admin.email = dto.email;
        }

        if (dto.name !== undefined) admin.name = dto.name;
        if (dto.profilePicture !== undefined) admin.profilePicture = dto.profilePicture as any;
        if (dto.isActive !== undefined) admin.isActive = dto.isActive;

        await admin.save();

        const redis = getRedis();
        await Promise.all([
            redis.del(CACHE_KEYS.ADMIN_BY_ID(id)),
            invalidateListCache(CACHE_KEYS.ADMIN_LIST),
        ]);

        if (auditContext) {
            publishAuditEvent(
                "STAFF_UPDATED",
                "ADMIN",
                id,
                auditContext.actor,
                {
                    context: auditContext.context,
                    previousData,
                    newData: { name: admin.name, email: admin.email, isActive: admin.isActive },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }

        return { success: true, profile: admin.toObject() };
    };

    deleteAdmin = async (id: string, auditContext?: CompanyAuditContext): Promise<DeleteResult> => {
        const admin = await Admin.findById(id);
        if (!admin) {
            return { success: false, message: "Admin not found" };
        }

        const previousData = { name: admin.name, email: admin.email, isActive: admin.isActive };

        admin.isActive = false;
        await admin.save();

        const redis = getRedis();
        await Promise.all([
            redis.del(CACHE_KEYS.ADMIN_BY_ID(id)),
            invalidateListCache(CACHE_KEYS.ADMIN_LIST),
        ]);

        if (auditContext) {
            publishAuditEvent(
                "STAFF_DELETED",
                "ADMIN",
                id,
                auditContext.actor,
                { context: auditContext.context, previousData }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }

        return { success: true, message: "Admin deactivated successfully" };
    };

    // ==================== CUSTOMER CARE ====================

    getCustomerCareProfileByUserId = async (userId: string): Promise<ProfileFetchResult> => {
        const profile = await CustomerCare.findOne({ userId })
            .select("-__v")
            .populate("profilePicture", "url type")
            .lean();

        if (!profile) {
            return { success: false, message: "Customer care profile not found" };
        }

        return { success: true, profile };
    };

    getCustomerCareList = async (options: PaginationDTO): Promise<PaginatedResult<Record<string, unknown>>> => {
        const redis = getRedis();
        const cacheKey = buildListCacheKey(CACHE_KEYS.CUSTOMER_CARE_LIST, options);

        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const { page = 1, limit = 20, search, isActive } = options;
        const skip = (page - 1) * limit;

        const filter: Record<string, unknown> = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { employeeCode: { $regex: search, $options: "i" } },
            ];
        }
        if (isActive !== undefined) {
            filter.isActive = isActive;
        }

        const [customerCareList, total] = await Promise.all([
            CustomerCare.find(filter)
                .populate("profilePicture", "url type")
                .populate("userId", "phone")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            CustomerCare.countDocuments(filter),
        ]);

        const result = {
            data: customerCareList,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
    };

    getCustomerCareById = async (id: string): Promise<ProfileFetchResult> => {
        const redis = getRedis();
        const cacheKey = CACHE_KEYS.CUSTOMER_CARE_BY_ID(id);

        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const profile = await CustomerCare.findById(id)
            .populate("profilePicture", "url type")
            .populate("userId", "phone")
            .lean();

        if (!profile) {
            return { success: false, message: "Customer care not found" };
        }

        const result = { success: true as const, profile };
        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
    };

    createCustomerCare = async (dto: CreateCustomerCareDTO, auditContext?: CompanyAuditContext): Promise<CreateResult> => {
        // Check if email already exists (read-only, outside transaction)
        const existingEmail = await CustomerCare.findOne({ email: dto.email });
        if (existingEmail) {
            return { success: false, message: "Email already exists" };
        }

        const employeeCode = await generateCustomerCareCode();

        const customerCare = await runInTransaction(async (session) => {
            const userResult = await authService.createUserWithRole(dto.phone, "CUSTOMER_CARE", "GLOBAL", undefined, session);
            if (!userResult.success) throw new Error(userResult.message ?? "Failed to create user");

            const [created] = await CustomerCare.create(
                [{ userId: userResult.userId, employeeCode, name: dto.name, email: dto.email, designation: dto.designation }],
                { session }
            );
            return created;
        });

        await invalidateListCache(CACHE_KEYS.CUSTOMER_CARE_LIST);

        if (auditContext) {
            publishAuditEvent(
                "STAFF_CREATED",
                "CUSTOMER_CARE",
                customerCare._id.toString(),
                auditContext.actor,
                {
                    context: auditContext.context,
                    newData: {
                        name: customerCare.name,
                        email: customerCare.email,
                        employeeCode: customerCare.employeeCode,
                        designation: customerCare.designation,
                    },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }

        return {
            success: true,
            profile: customerCare.toObject(),
        };
    };

    updateCustomerCare = async (id: string, dto: UpdateCustomerCareDTO, auditContext?: CompanyAuditContext): Promise<UpdateResult> => {
        const customerCare = await CustomerCare.findById(id);
        if (!customerCare) {
            return { success: false, message: "Customer care not found" };
        }

        const previousData = {
            name: customerCare.name,
            email: customerCare.email,
            designation: customerCare.designation,
            isActive: customerCare.isActive,
        };

        if (dto.email && dto.email !== customerCare.email) {
            const existingEmail = await CustomerCare.findOne({ email: dto.email, _id: { $ne: id } });
            if (existingEmail) {
                return { success: false, message: "Email already exists" };
            }
            customerCare.email = dto.email;
        }

        if (dto.name !== undefined) customerCare.name = dto.name;
        if (dto.designation !== undefined) customerCare.designation = dto.designation;
        if (dto.profilePicture !== undefined) customerCare.profilePicture = dto.profilePicture as any;
        if (dto.isActive !== undefined) customerCare.isActive = dto.isActive;

        await customerCare.save();

        const redis = getRedis();
        await Promise.all([
            redis.del(CACHE_KEYS.CUSTOMER_CARE_BY_ID(id)),
            invalidateListCache(CACHE_KEYS.CUSTOMER_CARE_LIST),
        ]);

        if (auditContext) {
            publishAuditEvent(
                "STAFF_UPDATED",
                "CUSTOMER_CARE",
                id,
                auditContext.actor,
                {
                    context: auditContext.context,
                    previousData,
                    newData: {
                        name: customerCare.name,
                        email: customerCare.email,
                        designation: customerCare.designation,
                        isActive: customerCare.isActive,
                    },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }

        return { success: true, profile: customerCare.toObject() };
    };

    deleteCustomerCare = async (id: string, auditContext?: CompanyAuditContext): Promise<DeleteResult> => {
        const customerCare = await CustomerCare.findById(id);
        if (!customerCare) {
            return { success: false, message: "Customer care not found" };
        }

        const previousData = {
            name: customerCare.name,
            email: customerCare.email,
            employeeCode: customerCare.employeeCode,
            isActive: customerCare.isActive,
        };

        customerCare.isActive = false;
        await customerCare.save();

        const redis = getRedis();
        await Promise.all([
            redis.del(CACHE_KEYS.CUSTOMER_CARE_BY_ID(id)),
            invalidateListCache(CACHE_KEYS.CUSTOMER_CARE_LIST),
        ]);

        if (auditContext) {
            publishAuditEvent(
                "STAFF_DELETED",
                "CUSTOMER_CARE",
                id,
                auditContext.actor,
                { context: auditContext.context, previousData }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }

        return { success: true, message: "Customer care deactivated successfully" };
    };

    // ==================== SALES ====================

    getSalesProfileByUserId = async (userId: string): Promise<ProfileFetchResult> => {
        const profile = await SalesProfile.findOne({ userId })
            .select("-__v")
            .populate("profilePicture", "url type")
            .lean();

        if (!profile) {
            return { success: false, message: "Sales profile not found" };
        }

        return { success: true, profile };
    };

    getSalesList = async (options: PaginationDTO): Promise<PaginatedResult<Record<string, unknown>>> => {
        const redis = getRedis();
        const cacheKey = buildListCacheKey(CACHE_KEYS.SALES_LIST, options);

        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const { page = 1, limit = 20, search, isActive } = options;
        const skip = (page - 1) * limit;

        const filter: Record<string, unknown> = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { employeeCode: { $regex: search, $options: "i" } },
            ];
        }
        if (isActive !== undefined) {
            filter.isActive = isActive;
        }

        const [salesList, total] = await Promise.all([
            SalesProfile.find(filter)
                .populate("profilePicture", "url type")
                .populate("userId", "phone")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            SalesProfile.countDocuments(filter),
        ]);

        const result = {
            data: salesList,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
    };

    getSalesById = async (id: string): Promise<ProfileFetchResult> => {
        const redis = getRedis();
        const cacheKey = CACHE_KEYS.SALES_BY_ID(id);

        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const profile = await SalesProfile.findById(id)
            .populate("profilePicture", "url type")
            .populate("userId", "phone")
            .lean();

        if (!profile) {
            return { success: false, message: "Sales person not found" };
        }

        const result = { success: true as const, profile };
        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
    };

    createSales = async (dto: CreateSalesDTO, auditContext?: CompanyAuditContext): Promise<CreateResult> => {
        // Check if email already exists (read-only, outside transaction)
        const existingEmail = await SalesProfile.findOne({ email: dto.email });
        if (existingEmail) {
            return { success: false, message: "Email already exists" };
        }

        const employeeCode = await generateSalesCode();

        const sales = await runInTransaction(async (session) => {
            const userResult = await authService.createUserWithRole(dto.phone, "SALES", "GLOBAL", undefined, session);
            if (!userResult.success) throw new Error(userResult.message ?? "Failed to create user");

            const [created] = await SalesProfile.create(
                [{ userId: userResult.userId, employeeCode, name: dto.name, email: dto.email }],
                { session }
            );
            return created;
        });

        await invalidateListCache(CACHE_KEYS.SALES_LIST);

        if (auditContext) {
            publishAuditEvent(
                "STAFF_CREATED",
                "SALES",
                sales._id.toString(),
                auditContext.actor,
                {
                    context: auditContext.context,
                    newData: {
                        name: sales.name,
                        email: sales.email,
                        employeeCode: sales.employeeCode,
                    },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }

        return {
            success: true,
            profile: sales.toObject(),
        };
    };

    updateSales = async (id: string, dto: UpdateSalesDTO, auditContext?: CompanyAuditContext): Promise<UpdateResult> => {
        const sales = await SalesProfile.findById(id);
        if (!sales) {
            return { success: false, message: "Sales person not found" };
        }

        const previousData = { name: sales.name, email: sales.email, isActive: sales.isActive };

        if (dto.email && dto.email !== sales.email) {
            const existingEmail = await SalesProfile.findOne({ email: dto.email, _id: { $ne: id } });
            if (existingEmail) {
                return { success: false, message: "Email already exists" };
            }
            sales.email = dto.email;
        }

        if (dto.name !== undefined) sales.name = dto.name;
        if (dto.profilePicture !== undefined) sales.profilePicture = dto.profilePicture as any;
        if (dto.isActive !== undefined) sales.isActive = dto.isActive;

        await sales.save();

        const redis = getRedis();
        await Promise.all([
            redis.del(CACHE_KEYS.SALES_BY_ID(id)),
            invalidateListCache(CACHE_KEYS.SALES_LIST),
        ]);

        if (auditContext) {
            publishAuditEvent(
                "STAFF_UPDATED",
                "SALES",
                id,
                auditContext.actor,
                {
                    context: auditContext.context,
                    previousData,
                    newData: { name: sales.name, email: sales.email, isActive: sales.isActive },
                }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }

        return { success: true, profile: sales.toObject() };
    };

    deleteSales = async (id: string, auditContext?: CompanyAuditContext): Promise<DeleteResult> => {
        const sales = await SalesProfile.findById(id);
        if (!sales) {
            return { success: false, message: "Sales person not found" };
        }

        const previousData = { name: sales.name, email: sales.email, isActive: sales.isActive };

        sales.isActive = false;
        await sales.save();

        const redis = getRedis();
        await Promise.all([
            redis.del(CACHE_KEYS.SALES_BY_ID(id)),
            invalidateListCache(CACHE_KEYS.SALES_LIST),
        ]);

        if (auditContext) {
            publishAuditEvent(
                "STAFF_DELETED",
                "SALES",
                id,
                auditContext.actor,
                { context: auditContext.context, previousData }
            ).catch((err) => logger.error("Audit publish failed:", err));
        }

        return { success: true, message: "Sales person deactivated successfully" };
    };
}

export default new CompanyService();
