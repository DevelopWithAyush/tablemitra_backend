import { Types } from "mongoose";
import { getRedis } from "../../infra/redis/redis.js";
import { ServiceCategoryModel } from "./db/category.model.js";
import { ServiceItemModel } from "./db/item.model.js";
import {
    CreateCategoryDTO,
    UpdateCategoryDTO,
    CreateServiceDTO,
    UpdateServiceDTO,
    PaginationDTO,
    ServiceResult,
    PaginatedResult,
    ToggleResult,
    ICategory,
    IService,
    IServicePopulated,
    ICategoryWithServices,
    IFullServiceCatalog,
    ServiceAuditContext,
    UserServiceResponse,
    UserServiceCategory,
    UserServiceItem,
    IAvailability,
} from "./service.types.js";
import logger from "../../helpers/logger/index.js";
import { publishAuditEvent } from "../audit/audit.publisher.js";
import { isServiceAvailable } from "./availability.util.js";
import attachmentService from "../attachments/attach.service.js";

// ==================== CACHE CONFIGURATION ====================

const CACHE_KEYS = {
    CATEGORIES_LIST: (hotelId: string) => `service:${hotelId}:categories:list`,
    CATEGORY_BY_ID: (hotelId: string, categoryId: string) => `service:${hotelId}:categories:${categoryId}`,
    SERVICES_LIST: (hotelId: string, categoryId: string) => `service:${hotelId}:categories:${categoryId}:services:list`,
    SERVICE_BY_ID: (hotelId: string, serviceId: string) => `service:${hotelId}:services:${serviceId}`,
    FULL_CATALOG: (hotelId: string) => `service:${hotelId}:full`,
    USER_CATALOG: (hotelId: string) => `service:${hotelId}:user_catalog`,
};

const CACHE_TTL = 1800; // 30 minutes
const USER_CATALOG_TTL = 300; // 5 minutes

// ==================== HELPER FUNCTIONS ====================

const buildListCacheKey = (base: string, options: PaginationDTO): string => {
    const { page = 1, limit = 20, search = "", isActive } = options;
    return `${base}:${page}:${limit}:${search}:${isActive ?? "all"}`;
};

const invalidateCachePattern = async (pattern: string): Promise<void> => {
    const redis = getRedis();
    let cursor = "0";
    do {
        const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(result.cursor);
        if (result.keys.length > 0) {
            await redis.del(result.keys);
        }
    } while (cursor !== "0");
};

const invalidateServiceCache = async (hotelId: string): Promise<void> => {
    await invalidateCachePattern(`service:${hotelId}:*`);
};

// ==================== SERVICE OPTIMIZATION SERVICE ====================

class ServiceOptimizationService {
    // ==================== CATEGORY OPERATIONS ====================

    /**
     * Get all categories for a hotel with pagination
     */
    getCategories = async (
        hotelId: string,
        options: PaginationDTO
    ): Promise<PaginatedResult<ICategory>> => {
        const redis = getRedis();
        const baseCacheKey = CACHE_KEYS.CATEGORIES_LIST(hotelId);
        const cacheKey = buildListCacheKey(baseCacheKey, options);

        // Check cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const { page = 1, limit = 20, search, isActive } = options;
        const skip = (page - 1) * limit;

        // Build filter
        const filter: Record<string, unknown> = { hotelId: new Types.ObjectId(hotelId) };
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ];
        }
        if (isActive !== undefined) {
            filter.isActive = isActive;
        }

        // Execute query
        const [categories, total] = await Promise.all([
            ServiceCategoryModel.find(filter)
                .populate("image", "url type")
                .sort({ sortOrder: 1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ServiceCategoryModel.countDocuments(filter),
        ]);

        const result: PaginatedResult<ICategory> = {
            data: categories as unknown as ICategory[],
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };

        // Cache result
        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
    };

    /**
     * Get category by ID
     */
    getCategoryById = async (
        hotelId: string,
        categoryId: string
    ): Promise<ServiceResult<ICategory>> => {
        const redis = getRedis();
        const cacheKey = CACHE_KEYS.CATEGORY_BY_ID(hotelId, categoryId);

        // Check cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const category = await ServiceCategoryModel.findOne({
            _id: new Types.ObjectId(categoryId),
            hotelId: new Types.ObjectId(hotelId),
        })
            .populate("image", "url type")
            .lean();

        if (!category) {
            return { success: false, message: "Category not found" };
        }

        const result: ServiceResult<ICategory> = {
            success: true,
            data: category as unknown as ICategory,
        };

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
    };

    /**
     * Create a new category
     */
    createCategory = async (
        hotelId: string,
        dto: CreateCategoryDTO,
        auditContext?: ServiceAuditContext
    ): Promise<ServiceResult<ICategory>> => {
        try {
            // Check for duplicate name in same hotel
            const existingCategory = await ServiceCategoryModel.findOne({
                hotelId: new Types.ObjectId(hotelId),
                name: { $regex: new RegExp(`^${dto.name}$`, "i") },
            });

            if (existingCategory) {
                return { success: false, message: "Category with this name already exists" };
            }

            const category = await ServiceCategoryModel.create({
                hotelId: new Types.ObjectId(hotelId),
                name: dto.name,
                description: dto.description,
                image: dto.image ? new Types.ObjectId(dto.image) : undefined,
                sortOrder: dto.sortOrder ?? 0,
                availability: dto.availability,
            });

            // Invalidate cache
            await invalidateServiceCache(hotelId);

            if (auditContext) {
                publishAuditEvent(
                    "SERVICE_CATEGORY_CREATED",
                    "SERVICE_CATEGORY",
                    category._id.toString(),
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { name: category.name } }
                ).catch(() => {});
            }

            logger.info(`Service category created: ${category._id} for hotel: ${hotelId}`);

            return {
                success: true,
                data: category.toObject() as unknown as ICategory,
            };
        } catch (error) {
            logger.error("Error creating service category:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to create category",
            };
        }
    };

    /**
     * Update a category
     */
    updateCategory = async (
        hotelId: string,
        categoryId: string,
        dto: UpdateCategoryDTO,
        auditContext?: ServiceAuditContext
    ): Promise<ServiceResult<ICategory>> => {
        try {
            const category = await ServiceCategoryModel.findOne({
                _id: new Types.ObjectId(categoryId),
                hotelId: new Types.ObjectId(hotelId),
            });

            if (!category) {
                return { success: false, message: "Category not found" };
            }

            // Check for duplicate name if name is being updated
            if (dto.name && dto.name !== category.name) {
                const existingCategory = await ServiceCategoryModel.findOne({
                    hotelId: new Types.ObjectId(hotelId),
                    name: { $regex: new RegExp(`^${dto.name}$`, "i") },
                    _id: { $ne: new Types.ObjectId(categoryId) },
                });

                if (existingCategory) {
                    return { success: false, message: "Category with this name already exists" };
                }
                category.name = dto.name;
            }

            // Update fields
            if (dto.description !== undefined) category.description = dto.description;
            if (dto.image !== undefined) {
                category.image = dto.image ? (new Types.ObjectId(dto.image) as any) : undefined;
            }
            if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
            if (dto.isActive !== undefined) category.isActive = dto.isActive;
            if (dto.availability !== undefined) {
                category.availability = dto.availability || undefined;
            }

            await category.save();

            if (auditContext) {
                publishAuditEvent(
                    "SERVICE_CATEGORY_UPDATED",
                    "SERVICE_CATEGORY",
                    categoryId,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { name: category.name, isActive: category.isActive } }
                ).catch(() => {});
            }

            // Invalidate cache
            await invalidateServiceCache(hotelId);

            logger.info(`Service category updated: ${categoryId}`);

            return {
                success: true,
                data: category.toObject() as unknown as ICategory,
            };
        } catch (error) {
            logger.error("Error updating service category:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update category",
            };
        }
    };

    /**
     * Toggle category active status
     */
    toggleCategory = async (hotelId: string, categoryId: string, auditContext?: ServiceAuditContext): Promise<ToggleResult> => {
        try {
            const category = await ServiceCategoryModel.findOne({
                _id: new Types.ObjectId(categoryId),
                hotelId: new Types.ObjectId(hotelId),
            });

            if (!category) {
                return { success: false, message: "Category not found" };
            }

            category.isActive = !category.isActive;
            await category.save();

            if (auditContext) {
                publishAuditEvent(
                    "SERVICE_CATEGORY_UPDATED",
                    "SERVICE_CATEGORY",
                    categoryId,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { isActive: category.isActive } }
                ).catch(() => {});
            }

            // Invalidate cache
            await invalidateServiceCache(hotelId);

            logger.info(`Service category toggled: ${categoryId}, isActive: ${category.isActive}`);

            return {
                success: true,
                message: `Category ${category.isActive ? "activated" : "deactivated"} successfully`,
                isActive: category.isActive,
            };
        } catch (error) {
            logger.error("Error toggling service category:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to toggle category",
            };
        }
    };

    // ==================== SERVICE OPERATIONS ====================

    /**
     * Get services in a category with pagination
     */
    getServices = async (
        hotelId: string,
        categoryId: string,
        options: PaginationDTO
    ): Promise<ServiceResult<PaginatedResult<IService>>> => {
        // Verify category exists and belongs to hotel
        const categoryExists = await ServiceCategoryModel.exists({
            _id: new Types.ObjectId(categoryId),
            hotelId: new Types.ObjectId(hotelId),
        });

        if (!categoryExists) {
            return { success: false, message: "Category not found" };
        }

        const redis = getRedis();
        const baseCacheKey = CACHE_KEYS.SERVICES_LIST(hotelId, categoryId);
        const cacheKey = buildListCacheKey(baseCacheKey, options);

        // Check cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return { success: true, data: JSON.parse(cached) };
        }

        const { page = 1, limit = 20, search, isActive } = options;
        const skip = (page - 1) * limit;

        // Build filter
        const filter: Record<string, unknown> = {
            hotelId: new Types.ObjectId(hotelId),
            categoryId: new Types.ObjectId(categoryId),
        };

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { shortCode: { $regex: search, $options: "i" } },
            ];
        }
        if (isActive !== undefined) filter.isActive = isActive;

        // Execute query
        const [services, total] = await Promise.all([
            ServiceItemModel.find(filter)
                .populate("image", "url type")
                .sort({ sortOrder: 1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ServiceItemModel.countDocuments(filter),
        ]);

        const result: PaginatedResult<IService> = {
            data: services as unknown as IService[],
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };

        // Cache result
        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));

        return { success: true, data: result };
    };

    /**
     * Get service by ID
     */
    getServiceById = async (
        hotelId: string,
        serviceId: string
    ): Promise<ServiceResult<IServicePopulated>> => {
        const redis = getRedis();
        const cacheKey = CACHE_KEYS.SERVICE_BY_ID(hotelId, serviceId);

        // Check cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const service = await ServiceItemModel.findOne({
            _id: new Types.ObjectId(serviceId),
            hotelId: new Types.ObjectId(hotelId),
        })
            .populate("image", "url type")
            .lean();

        if (!service) {
            return { success: false, message: "Service not found" };
        }

        const result: ServiceResult<IServicePopulated> = {
            success: true,
            data: service as unknown as IServicePopulated,
        };

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
    };

    /**
     * Create a new service
     */
    createService = async (
        hotelId: string,
        categoryId: string,
        dto: CreateServiceDTO,
        auditContext?: ServiceAuditContext
    ): Promise<ServiceResult<IService>> => {
        try {
            // Verify category exists
            const categoryExists = await ServiceCategoryModel.exists({
                _id: new Types.ObjectId(categoryId),
                hotelId: new Types.ObjectId(hotelId),
            });

            if (!categoryExists) {
                return { success: false, message: "Category not found" };
            }

            // Check for duplicate shortCode in same hotel
            const existingService = await ServiceItemModel.findOne({
                hotelId: new Types.ObjectId(hotelId),
                shortCode: dto.shortCode.toUpperCase(),
            });

            if (existingService) {
                return { success: false, message: "Service with this short code already exists" };
            }

            // Create service
            const service = await ServiceItemModel.create({
                hotelId: new Types.ObjectId(hotelId),
                categoryId: new Types.ObjectId(categoryId),
                name: dto.name,
                description: dto.description,
                image: dto.image ? new Types.ObjectId(dto.image) : undefined,
                shortCode: dto.shortCode.toUpperCase(),
                sortOrder: dto.sortOrder ?? 0,
                price: dto.price ?? 0,
                estimatedTimeMinutes: dto.estimatedTimeMinutes,
                availability: dto.availability,
            });

            if (auditContext) {
                publishAuditEvent(
                    "SERVICE_ITEM_CREATED",
                    "SERVICE_ITEM",
                    service._id.toString(),
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { name: service.name, shortCode: service.shortCode, categoryId } }
                ).catch(() => {});
            }

            // Invalidate cache
            await invalidateServiceCache(hotelId);

            logger.info(`Service created: ${service._id} for hotel: ${hotelId}`);

            return {
                success: true,
                data: service.toObject() as unknown as IService,
            };
        } catch (error) {
            logger.error("Error creating service:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to create service",
            };
        }
    };

    /**
     * Update a service
     */
    updateService = async (
        hotelId: string,
        serviceId: string,
        dto: UpdateServiceDTO,
        auditContext?: ServiceAuditContext
    ): Promise<ServiceResult<IServicePopulated>> => {
        try {
            const service = await ServiceItemModel.findOne({
                _id: new Types.ObjectId(serviceId),
                hotelId: new Types.ObjectId(hotelId),
            });

            if (!service) {
                return { success: false, message: "Service not found" };
            }

            // Check for duplicate shortCode if being updated
            if (dto.shortCode && dto.shortCode.toUpperCase() !== service.shortCode) {
                const existingService = await ServiceItemModel.findOne({
                    hotelId: new Types.ObjectId(hotelId),
                    shortCode: dto.shortCode.toUpperCase(),
                    _id: { $ne: new Types.ObjectId(serviceId) },
                });

                if (existingService) {
                    return { success: false, message: "Service with this short code already exists" };
                }
                service.shortCode = dto.shortCode.toUpperCase();
            }

            // Update fields
            if (dto.name !== undefined) service.name = dto.name;
            if (dto.description !== undefined) service.description = dto.description;
            if (dto.image !== undefined) {
                service.image = dto.image ? (new Types.ObjectId(dto.image) as any) : undefined;
            }
            if (dto.sortOrder !== undefined) service.sortOrder = dto.sortOrder;
            if (dto.price !== undefined) service.price = dto.price;
            if (dto.estimatedTimeMinutes !== undefined) {
                service.estimatedTimeMinutes = dto.estimatedTimeMinutes ?? undefined;
            }
            if (dto.isActive !== undefined) service.isActive = dto.isActive;
            if (dto.availability !== undefined) {
                service.availability = dto.availability || undefined;
            }

            await service.save();

            if (auditContext) {
                publishAuditEvent(
                    "SERVICE_ITEM_UPDATED",
                    "SERVICE_ITEM",
                    serviceId,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId } }
                ).catch(() => {});
            }

            // Fetch updated service with populated image
            const updatedService = await this.getServiceById(hotelId, serviceId);
            if (!updatedService.success) {
                return updatedService;
            }

            // Invalidate cache
            await invalidateServiceCache(hotelId);

            logger.info(`Service updated: ${serviceId}`);

            return updatedService;
        } catch (error) {
            logger.error("Error updating service:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update service",
            };
        }
    };

    /**
     * Toggle service active status
     */
    toggleService = async (hotelId: string, serviceId: string, auditContext?: ServiceAuditContext): Promise<ToggleResult> => {
        try {
            const service = await ServiceItemModel.findOne({
                _id: new Types.ObjectId(serviceId),
                hotelId: new Types.ObjectId(hotelId),
            });

            if (!service) {
                return { success: false, message: "Service not found" };
            }

            service.isActive = !service.isActive;
            await service.save();

            if (auditContext) {
                publishAuditEvent(
                    "SERVICE_ITEM_AVAILABILITY_CHANGED",
                    "SERVICE_ITEM",
                    serviceId,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { isActive: service.isActive } }
                ).catch(() => {});
            }

            // Invalidate cache
            await invalidateServiceCache(hotelId);

            logger.info(`Service toggled: ${serviceId}, isActive: ${service.isActive}`);

            return {
                success: true,
                message: `Service ${service.isActive ? "activated" : "deactivated"} successfully`,
                isActive: service.isActive,
            };
        } catch (error) {
            logger.error("Error toggling service:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to toggle service",
            };
        }
    };

    // ==================== FULL CATALOG ====================

    /**
     * Get full service catalog with nested categories and services
     */
    getFullCatalog = async (
        hotelId: string,
        includeInactive = false
    ): Promise<ServiceResult<IFullServiceCatalog>> => {
        const redis = getRedis();
        const cacheKey = `${CACHE_KEYS.FULL_CATALOG(hotelId)}:${includeInactive}`;

        // Check cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return { success: true, data: JSON.parse(cached) };
        }

        // Build category filter
        const categoryFilter: Record<string, unknown> = {
            hotelId: new Types.ObjectId(hotelId),
        };
        if (!includeInactive) {
            categoryFilter.isActive = true;
        }

        // Get all categories
        const categories = await ServiceCategoryModel.find(categoryFilter)
            .populate("image", "url type")
            .sort({ sortOrder: 1 })
            .lean();

        // Build service filter
        const serviceFilter: Record<string, unknown> = {
            hotelId: new Types.ObjectId(hotelId),
        };
        if (!includeInactive) {
            serviceFilter.isActive = true;
        }

        // Get all services
        const services = await ServiceItemModel.find(serviceFilter)
            .populate("image", "url type")
            .sort({ sortOrder: 1 })
            .lean();

        // Create service map for quick lookup by category
        const serviceMap = new Map<string, IServicePopulated[]>();
        for (const service of services) {
            const categoryIdStr = service.categoryId.toString();
            if (!serviceMap.has(categoryIdStr)) {
                serviceMap.set(categoryIdStr, []);
            }
            serviceMap.get(categoryIdStr)!.push(service as unknown as IServicePopulated);
        }

        // Build nested response
        const categoriesWithServices: ICategoryWithServices[] = categories.map((category) => ({
            ...(category as unknown as ICategoryWithServices),
            services: serviceMap.get(category._id.toString()) || [],
        }));

        const result: IFullServiceCatalog = {
            hotelId,
            categories: categoriesWithServices,
            totalCategories: categories.length,
            totalServices: services.length,
        };

        // Cache result
        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));

        return { success: true, data: result };
    };

    // ==================== USER SERVICE CATALOG (CUSTOMER-FACING) ====================

    /**
     * Get service catalog for customer: active categories and items, with image URLs,
     * availability object and isAvailable computed per request using hotel timezone.
     * Raw catalog (without isAvailable) cached for 5 minutes.
     */
    getServiceCatalogForUser = async (
        hotelId: string,
        hotelTimezone: string
    ): Promise<ServiceResult<UserServiceResponse>> => {
        const redis = getRedis();
        const cacheKey = CACHE_KEYS.USER_CATALOG(hotelId);

        type RawItem = {
            id: string;
            name: string;
            price: number;
            discountedPrice?: number;
            description?: string;
            image: string | null;
            availability: IAvailability;
            isAvailable?: never;
        };
        type RawCategory = { id: string; name: string; image: string | null; items: RawItem[] };

        let raw: { categories: RawCategory[] };
        const cached = await redis.get(cacheKey);
        if (cached) {
            raw = JSON.parse(cached);
        } else {
            const categories = await ServiceCategoryModel.find({
                hotelId: new Types.ObjectId(hotelId),
                isActive: true,
            })
                .sort({ sortOrder: 1 })
                .select("_id name image")
                .lean();
            if (categories.length === 0) {
                return { success: true, data: { categories: [] } };
            }
            const categoryIds = categories.map((c) => c._id);
            const items = await ServiceItemModel.find({
                hotelId: new Types.ObjectId(hotelId),
                categoryId: { $in: categoryIds },
                isActive: true,
            })
                .sort({ sortOrder: 1 })
                .select("categoryId name description price image availability")
                .lean();
            const itemImageIds = [...new Set(items.map((i) => i.image?.toString()).filter(Boolean) as string[])];
            const categoryImageIds = [...new Set(categories.map((c) => (c as { image?: Types.ObjectId }).image?.toString()).filter(Boolean) as string[])];
            const allImageIds = [...new Set([...itemImageIds, ...categoryImageIds])];
            const urlMap = await attachmentService.getAttachmentUrlsByIds(allImageIds);
            const itemMap = new Map<string, typeof items>();
            for (const item of items) {
                const cid = item.categoryId.toString();
                if (!itemMap.has(cid)) itemMap.set(cid, []);
                itemMap.get(cid)!.push(item);
            }
            raw = {
                categories: categories.map((cat) => {
                    const catItems = itemMap.get(cat._id.toString()) || [];
                    const catImage = (cat as { image?: Types.ObjectId }).image;
                    return {
                        id: cat._id.toString(),
                        name: cat.name,
                        image: (catImage && urlMap[catImage.toString()]) || null,
                        items: catItems.map((i) => {
                            const av = (i.availability as IAvailability) ?? { days: [] };
                            return {
                                id: i._id.toString(),
                                name: i.name,
                                price: i.price ?? 0,
                                discountedPrice: (i as { discountedPrice?: number }).discountedPrice ?? undefined,
                                description: i.description ?? undefined,
                                image: (i.image && urlMap[i.image.toString()]) || null,
                                availability: {
                                    days: av.days ?? [],
                                    startTime: av.startTime,
                                    endTime: av.endTime,
                                },
                            };
                        }),
                    };
                }),
            };
            await redis.setEx(cacheKey, USER_CATALOG_TTL, JSON.stringify(raw));
        }

        const response: UserServiceResponse = {
            categories: raw.categories.map((cat) => ({
                id: cat.id,
                name: cat.name,
                image: cat.image ?? null,
                items: cat.items.map((it) => ({
                    id: it.id,
                    name: it.name,
                    price: it.price,
                    discountedPrice: it.discountedPrice,
                    description: it.description,
                    image: it.image,
                    availability: it.availability,
                    isAvailable: isServiceAvailable(it.availability, hotelTimezone),
                })) as UserServiceItem[],
            })) as UserServiceCategory[],
        };
        return { success: true, data: response };
    };
}

export default new ServiceOptimizationService();
