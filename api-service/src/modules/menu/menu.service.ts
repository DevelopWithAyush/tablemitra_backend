import { Types } from "mongoose";
import { runInTransaction } from "../../infra/db/transaction.js";
import { getRedis } from "../../infra/redis/redis.js";
import { CategoryModel } from "./db/category.model.js";
import { ItemModel } from "./db/item.model.js";
import { VariantModel } from "./db/variant.model.js";
import {
    CreateCategoryDTO,
    UpdateCategoryDTO,
    CreateItemDTO,
    UpdateItemDTO,
    PaginationDTO,
    ServiceResult,
    ToggleResult,
    ICategory,
    IItem,
    IVariant,
    IItemWithVariants,
    IItemDetail,
    ISuggestedItemSummary,
    ICategoryWithItems,
    IFullMenu,
    GetFullMenuOptions,
    VariantPriceRange,
    MenuAuditContext,
    UserMenuResponse,
    UserMenuCategory,
    UserMenuItem,
    ItemDetailForCustomer,
    ItemDetailVariant,
    ItemDetailSuggestedItem,
    GetItemsWithTaxesInput,
    GetItemsWithTaxesResult,
} from "./menu.types.js";
import type { IAvailability, ITaxEntry } from "./menu.types.js";
import logger from "../../helpers/logger/index.js";
import { publishAuditEvent } from "../audit/audit.publisher.js";
import { isItemAvailable } from "./availability.util.js";
import attachmentService from "../attachments/attach.service.js";

// ==================== CACHE CONFIGURATION ====================

const CACHE_KEYS = {
    CATEGORIES_LIST: (hotelId: string) => `menu:${hotelId}:categories:list`,
    CATEGORY_BY_ID: (hotelId: string, categoryId: string) => `menu:${hotelId}:categories:${categoryId}`,
    ITEMS_LIST: (hotelId: string, categoryId: string) => `menu:${hotelId}:categories:${categoryId}:items:list`,
    ITEM_BY_ID: (hotelId: string, itemId: string) => `menu:${hotelId}:items:${itemId}`,
    VARIANTS_LIST: (hotelId: string, itemId: string) => `menu:${hotelId}:items:${itemId}:variants`,
    FULL_MENU: (hotelId: string) => `menu:${hotelId}:full`,
    USER_MENU: (hotelId: string) => `menu:${hotelId}:user_menu`,
};

const CACHE_TTL = 1800; // 30 minutes
const USER_MENU_TTL = 300; // 5 minutes

// ==================== HELPER FUNCTIONS ====================

const buildListCacheKey = (base: string, options: PaginationDTO): string => {
    const { search = "", isActive, type, isPopular } = options;
    return `${base}:${search}:${isActive ?? "all"}:${type ?? "all"}:${isPopular ?? "all"}`;
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

const invalidateMenuCache = async (hotelId: string): Promise<void> => {
    await invalidateCachePattern(`menu:${hotelId}:*`);
};

// Escape special regex characters so user-supplied names cannot alter the pattern
const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// MongoDB E11000 = duplicate key — thrown when a unique index constraint is violated
const isDuplicateKeyError = (err: unknown): boolean =>
    typeof err === "object" && err !== null && (err as any).code === 11000;

const calculateVariantPriceRange = (variants: { price: number }[]): VariantPriceRange => {
    if (variants.length === 0) {
        return { minVariantPrice: 0, maxVariantPrice: 0 };
    }
    const prices = variants.map((v) => v.price);
    return {
        minVariantPrice: Math.min(...prices),
        maxVariantPrice: Math.max(...prices),
    };
};

// ==================== MENU SERVICE ====================

class MenuService {
    // ==================== CATEGORY OPERATIONS ====================

    /**
     * Get all categories for a hotel with pagination
     */
    getCategories = async (
        hotelId: string,
        options: PaginationDTO
    ): Promise<ICategory[]> => {
        const redis = getRedis();
        const baseCacheKey = CACHE_KEYS.CATEGORIES_LIST(hotelId);
        const cacheKey = buildListCacheKey(baseCacheKey, options);

        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const { search, isActive } = options;

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

        const categories = await CategoryModel.find(filter)
            .populate("image", "url type")
            .sort({ sortOrder: 1, createdAt: -1 })
            .lean();

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(categories));
        return categories as unknown as ICategory[];
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

        const category = await CategoryModel.findOne({
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
        auditContext?: MenuAuditContext
    ): Promise<ServiceResult<ICategory>> => {
        try {
            // Case-insensitive duplicate name check (escaped to prevent regex injection)
            const existingCategory = await CategoryModel.findOne({
                hotelId: new Types.ObjectId(hotelId),
                name: { $regex: new RegExp(`^${escapeRegex(dto.name)}$`, "i") },
            });

            if (existingCategory) {
                return { success: false, message: "Category with this name already exists" };
            }

            // Ensure all referenced categories belong to this hotel
            if (dto.suggestedCategoryIds && dto.suggestedCategoryIds.length > 0) {
                const validCount = await CategoryModel.countDocuments({
                    _id: { $in: dto.suggestedCategoryIds.map((id) => new Types.ObjectId(id)) },
                    hotelId: new Types.ObjectId(hotelId),
                });
                if (validCount !== dto.suggestedCategoryIds.length) {
                    return { success: false, message: "One or more suggested categories do not belong to this hotel" };
                }
            }

            const category = await CategoryModel.create({
                hotelId: new Types.ObjectId(hotelId),
                name: dto.name,
                description: dto.description,
                image: dto.image ? new Types.ObjectId(dto.image) : undefined,
                sortOrder: dto.sortOrder ?? 0,
                availability: dto.availability,
                suggestedCategoryIds: dto.suggestedCategoryIds?.map((id) => new Types.ObjectId(id)),
            });

            // Invalidate cache
            await invalidateMenuCache(hotelId);

            if (auditContext) {
                publishAuditEvent(
                    "MENU_CATEGORY_CREATED",
                    "MENU_CATEGORY",
                    category._id.toString(),
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { name: category.name } }
                ).catch((err) => logger.error("Audit publish failed:", err));
            }

            logger.info(`Category created: ${category._id} for hotel: ${hotelId}`);

            return {
                success: true,
                data: category.toObject() as unknown as ICategory,
            };
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                return { success: false, message: "Category with this name already exists" };
            }
            logger.error("Error creating category:", error);
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
        auditContext?: MenuAuditContext
    ): Promise<ServiceResult<ICategory>> => {
        try {
            const category = await CategoryModel.findOne({
                _id: new Types.ObjectId(categoryId),
                hotelId: new Types.ObjectId(hotelId),
            });

            if (!category) {
                return { success: false, message: "Category not found" };
            }

            // Check for duplicate name if name is being updated
            if (dto.name && dto.name !== category.name) {
                const existingCategory = await CategoryModel.findOne({
                    hotelId: new Types.ObjectId(hotelId),
                    name: { $regex: new RegExp(`^${escapeRegex(dto.name)}$`, "i") },
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
                if (!dto.availability) {
                    category.availability = undefined;
                } else {
                    // Explicitly set all subfields so absent fields are $unset, not merged
                    category.availability = {
                        days: dto.availability.days,
                        startTime: dto.availability.startTime,
                        endTime: dto.availability.endTime,
                    } as any;
                }
            }
            if (dto.suggestedCategoryIds !== undefined) {
                // Validate cross-hotel ownership before persisting
                if (dto.suggestedCategoryIds.length > 0) {
                    const validCount = await CategoryModel.countDocuments({
                        _id: { $in: dto.suggestedCategoryIds.map((id) => new Types.ObjectId(id)) },
                        hotelId: new Types.ObjectId(hotelId),
                    });
                    if (validCount !== dto.suggestedCategoryIds.length) {
                        return { success: false, message: "One or more suggested categories do not belong to this hotel" };
                    }
                }
                category.suggestedCategoryIds = dto.suggestedCategoryIds.map(
                    (id) => new Types.ObjectId(id) as any
                );
            }

            await category.save();

            // Invalidate cache
            await invalidateMenuCache(hotelId);

            if (auditContext) {
                publishAuditEvent(
                    "MENU_CATEGORY_UPDATED",
                    "MENU_CATEGORY",
                    categoryId,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { name: category.name, isActive: category.isActive } }
                ).catch((err) => logger.error("Audit publish failed:", err));
            }

            logger.info(`Category updated: ${categoryId}`);

            return {
                success: true,
                data: category.toObject() as unknown as ICategory,
            };
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                return { success: false, message: "Category with this name already exists" };
            }
            logger.error("Error updating category:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update category",
            };
        }
    };

    /**
     * Toggle category active status
     */
    toggleCategory = async (hotelId: string, categoryId: string, auditContext?: MenuAuditContext): Promise<ToggleResult> => {
        try {
            const category = await CategoryModel.findOne({
                _id: new Types.ObjectId(categoryId),
                hotelId: new Types.ObjectId(hotelId),
            });

            if (!category) {
                return { success: false, message: "Category not found" };
            }

            category.isActive = !category.isActive;
            await category.save();

            // Invalidate cache
            await invalidateMenuCache(hotelId);

            if (auditContext) {
                publishAuditEvent(
                    "MENU_CATEGORY_UPDATED",
                    "MENU_CATEGORY",
                    categoryId,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { isActive: category.isActive } }
                ).catch((err) => logger.error("Audit publish failed:", err));
            }

            logger.info(`Category toggled: ${categoryId}, isActive: ${category.isActive}`);

            return {
                success: true,
                message: `Category ${category.isActive ? "activated" : "deactivated"} successfully`,
                isActive: category.isActive,
            };
        } catch (error) {
            logger.error("Error toggling category:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to toggle category",
            };
        }
    };

    // ==================== ITEM OPERATIONS ====================

    /**
     * Get items in a category with pagination
     */
    getItems = async (
        hotelId: string,
        categoryId: string,
        options: PaginationDTO
    ): Promise<ServiceResult<IItem[]>> => {
        const categoryExists = await CategoryModel.exists({
            _id: new Types.ObjectId(categoryId),
            hotelId: new Types.ObjectId(hotelId),
        });

        if (!categoryExists) {
            return { success: false, message: "Category not found" };
        }

        const redis = getRedis();
        const baseCacheKey = CACHE_KEYS.ITEMS_LIST(hotelId, categoryId);
        const cacheKey = buildListCacheKey(baseCacheKey, options);

        const cached = await redis.get(cacheKey);
        if (cached) {
            return { success: true, data: JSON.parse(cached) };
        }

        const { search, isActive, type, isPopular } = options;

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
        if (type) filter.type = type;
        if (isPopular !== undefined) filter.isPopular = isPopular;

        const items = await ItemModel.find(filter)
            .populate("image", "url type")
            .sort({ sortOrder: 1, createdAt: -1 })
            .lean();

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(items));
        return { success: true, data: items as unknown as IItem[] };
    };

    /**
     * Get item by ID with variants
     */
    getItemById = async (
        hotelId: string,
        itemId: string
    ): Promise<ServiceResult<IItemWithVariants>> => {
        const redis = getRedis();
        const cacheKey = CACHE_KEYS.ITEM_BY_ID(hotelId, itemId);

        // Check cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const item = await ItemModel.findOne({
            _id: new Types.ObjectId(itemId),
            hotelId: new Types.ObjectId(hotelId),
        })
            .populate("image", "url type")
            .lean();

        if (!item) {
            return { success: false, message: "Item not found" };
        }

        // Get variants if hasVariants is true
        let variants: IVariant[] = [];
        if (item.hasVariants) {
            variants = (await VariantModel.find({
                itemId: new Types.ObjectId(itemId),
                hotelId: new Types.ObjectId(hotelId),
            })
                .sort({ sortOrder: 1 })
                .lean()) as unknown as IVariant[];
        }

        const result: ServiceResult<IItemWithVariants> = {
            success: true,
            data: {
                ...(item as unknown as IItemWithVariants),
                variants,
            },
        };

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
    };

    /**
     * Get item by ID with full detail for edit page: item, variants, suggested items (populated), category.
     */
    getItemDetail = async (
        hotelId: string,
        itemId: string
    ): Promise<ServiceResult<IItemDetail>> => {
        const item = await ItemModel.findOne({
            _id: new Types.ObjectId(itemId),
            hotelId: new Types.ObjectId(hotelId),
        })
            .populate("image", "url type")
            .lean();

        if (!item) {
            return { success: false, message: "Item not found" };
        }

        let variants: IVariant[] = [];
        if (item.hasVariants) {
            variants = (await VariantModel.find({
                itemId: new Types.ObjectId(itemId),
                hotelId: new Types.ObjectId(hotelId),
            })
                .sort({ sortOrder: 1 })
                .lean()) as unknown as IVariant[];
        }

        const category = await CategoryModel.findOne(
            { _id: item.categoryId, hotelId: new Types.ObjectId(hotelId) },
            "name"
        )
            .lean();

        let suggestedItems: ISuggestedItemSummary[] = [];
        const suggestedIds = item.suggestedItemIds?.length
            ? item.suggestedItemIds
            : [];
        if (suggestedIds.length > 0) {
            const suggested = await ItemModel.find({
                _id: { $in: suggestedIds },
                hotelId: new Types.ObjectId(hotelId),
            })
                .select("name shortCode type categoryId isActive price hasVariants minVariantPrice maxVariantPrice")
                .lean();
            suggestedItems = suggested as unknown as ISuggestedItemSummary[];
        }

        const data: IItemDetail = {
            ...(item as unknown as IItemWithVariants),
            variants,
            suggestedItems,
            category: category
                ? { _id: category._id as Types.ObjectId, name: category.name }
                : { _id: item.categoryId as Types.ObjectId, name: "" },
        };

        return { success: true, data };
    };

    /**
     * Create a new item with optional variants
     */
    createItem = async (
        hotelId: string,
        categoryId: string,
        dto: CreateItemDTO,
        auditContext?: MenuAuditContext
    ): Promise<ServiceResult<IItemWithVariants>> => {
        try {
            // Verify category exists
            const categoryExists = await CategoryModel.exists({
                _id: new Types.ObjectId(categoryId),
                hotelId: new Types.ObjectId(hotelId),
            });

            if (!categoryExists) {
                return { success: false, message: "Category not found" };
            }

            // Check for duplicate shortCode in same hotel
            const existingItem = await ItemModel.findOne({
                hotelId: new Types.ObjectId(hotelId),
                shortCode: dto.shortCode.toUpperCase(),
            });

            if (existingItem) {
                return { success: false, message: "Item with this short code already exists" };
            }

            // Ensure all referenced items belong to this hotel
            if (dto.suggestedItemIds && dto.suggestedItemIds.length > 0) {
                const validCount = await ItemModel.countDocuments({
                    _id: { $in: dto.suggestedItemIds.map((id) => new Types.ObjectId(id)) },
                    hotelId: new Types.ObjectId(hotelId),
                });
                if (validCount !== dto.suggestedItemIds.length) {
                    return { success: false, message: "One or more suggested items do not belong to this hotel" };
                }
            }

            const hasVariants = dto.variants && dto.variants.length > 0;

            // Calculate variant price range
            let variantPriceRange: VariantPriceRange | undefined;
            if (hasVariants && dto.variants) {
                variantPriceRange = calculateVariantPriceRange(dto.variants);
            }

            // Create item and variants atomically — if variant insert fails the
            // item is rolled back, preventing an orphaned item with hasVariants:true
            // but no variant documents in the DB.
            const { item, variants } = await runInTransaction(async (session) => {
                const [newItem] = await ItemModel.create(
                    [
                        {
                            hotelId: new Types.ObjectId(hotelId),
                            categoryId: new Types.ObjectId(categoryId),
                            name: dto.name,
                            description: dto.description,
                            image: dto.image ? new Types.ObjectId(dto.image) : undefined,
                            shortCode: dto.shortCode.toUpperCase(),
                            sortOrder: dto.sortOrder ?? 0,
                            type: dto.type,
                            preparationTimeMinutes: dto.preparationTimeMinutes,
                            price: hasVariants ? undefined : dto.price,
                            discountedPrice: hasVariants ? undefined : dto.discountedPrice,
                            hasVariants,
                            minVariantPrice: variantPriceRange?.minVariantPrice,
                            maxVariantPrice: variantPriceRange?.maxVariantPrice,
                            isPopular: dto.isPopular ?? false,
                            availability: dto.availability,
                            taxes: dto.taxes,
                            suggestedItemIds: dto.suggestedItemIds?.map((id) => new Types.ObjectId(id)),
                        },
                    ],
                    { session }
                );

                let createdVariants: IVariant[] = [];
                if (hasVariants && dto.variants) {
                    const variantDocs = dto.variants.map((v) => ({
                        hotelId: new Types.ObjectId(hotelId),
                        itemId: newItem._id,
                        name: v.name,
                        shortCode: v.shortCode.toUpperCase(),
                        price: v.price,
                        discountedPrice: v.discountedPrice,
                        preparationTimeMinutes: v.preparationTimeMinutes,
                        sortOrder: v.sortOrder ?? 0,
                    }));
                    const inserted = await VariantModel.insertMany(variantDocs, { session });
                    createdVariants = inserted.map((v) => v.toObject()) as unknown as IVariant[];
                }

                return { item: newItem, variants: createdVariants };
            });

            // Invalidate cache
            await invalidateMenuCache(hotelId);

            if (auditContext) {
                publishAuditEvent(
                    "MENU_ITEM_CREATED",
                    "MENU_ITEM",
                    item._id.toString(),
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { name: item.name, shortCode: item.shortCode, categoryId } }
                ).catch((err) => logger.error("Audit publish failed:", err));
            }

            logger.info(`Item created: ${item._id} for hotel: ${hotelId}`);

            return {
                success: true,
                data: {
                    ...(item.toObject() as unknown as IItemWithVariants),
                    variants,
                },
            };
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                return { success: false, message: "Item with this short code already exists" };
            }
            logger.error("Error creating item:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to create item",
            };
        }
    };

    /**
     * Update an item with optional variant updates
     */
    updateItem = async (
        hotelId: string,
        itemId: string,
        dto: UpdateItemDTO,
        auditContext?: MenuAuditContext
    ): Promise<ServiceResult<IItemWithVariants>> => {
        try {
            const item = await ItemModel.findOne({
                _id: new Types.ObjectId(itemId),
                hotelId: new Types.ObjectId(hotelId),
            });

            if (!item) {
                return { success: false, message: "Item not found" };
            }

            // Check for duplicate shortCode if being updated
            if (dto.shortCode && dto.shortCode.toUpperCase() !== item.shortCode) {
                const existingItem = await ItemModel.findOne({
                    hotelId: new Types.ObjectId(hotelId),
                    shortCode: dto.shortCode.toUpperCase(),
                    _id: { $ne: new Types.ObjectId(itemId) },
                });

                if (existingItem) {
                    return { success: false, message: "Item with this short code already exists" };
                }
                item.shortCode = dto.shortCode.toUpperCase();
            }

            // Update basic fields
            if (dto.name !== undefined) item.name = dto.name;
            if (dto.description !== undefined) item.description = dto.description;
            if (dto.image !== undefined) {
                item.image = dto.image ? (new Types.ObjectId(dto.image) as any) : undefined;
            }
            if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
            if (dto.type !== undefined) item.type = dto.type;
            if (dto.preparationTimeMinutes !== undefined) {
                item.preparationTimeMinutes = dto.preparationTimeMinutes;
            }
            if (dto.isPopular !== undefined) item.isPopular = dto.isPopular;
            if (dto.isActive !== undefined) item.isActive = dto.isActive;
            if (dto.availability !== undefined) {
                if (!dto.availability) {
                    item.availability = undefined;
                } else {
                    // Explicitly set all subfields so absent fields are $unset, not merged
                    item.availability = {
                        days: dto.availability.days,
                        startTime: dto.availability.startTime,
                        endTime: dto.availability.endTime,
                    } as any;
                }
            }
            if (dto.taxes !== undefined) {
                item.set("taxes", dto.taxes ?? []);
            }
            if (dto.suggestedItemIds !== undefined) {
                // Validate: no self-reference, and all belong to this hotel
                if (dto.suggestedItemIds.length > 0) {
                    if (dto.suggestedItemIds.some((id) => id === itemId)) {
                        return { success: false, message: "Item cannot suggest itself as an upsell" };
                    }
                    const validCount = await ItemModel.countDocuments({
                        _id: { $in: dto.suggestedItemIds.map((id) => new Types.ObjectId(id)) },
                        hotelId: new Types.ObjectId(hotelId),
                    });
                    if (validCount !== dto.suggestedItemIds.length) {
                        return { success: false, message: "One or more suggested items do not belong to this hotel" };
                    }
                }
                item.suggestedItemIds = dto.suggestedItemIds.map((id) => new Types.ObjectId(id) as any);
            }

            // Handle variants update
            if (dto.variants !== undefined) {
                // Validate duplicate variant shortCodes before DB write
                const shortCodes = dto.variants.map((v) => v.shortCode.toUpperCase());
                const duplicateShortCode = shortCodes.find((sc, i) => shortCodes.indexOf(sc) !== i);
                if (duplicateShortCode) {
                    return { success: false, message: `Duplicate variant short code: ${duplicateShortCode}` };
                }

                // Wrap all three writes atomically: deleteMany + optional insertMany + item.save().
                // Without a transaction, deleteMany succeeding but insertMany failing would
                // permanently destroy all variants with no way to recover them.
                await runInTransaction(async (session) => {
                    const hasVariants = dto.variants!.length > 0;
                    item.hasVariants = hasVariants;

                    await VariantModel.deleteMany(
                        { itemId: new Types.ObjectId(itemId), hotelId: new Types.ObjectId(hotelId) },
                        { session }
                    );

                    if (hasVariants) {
                        const variantDocs = dto.variants!.map((v) => ({
                            hotelId: new Types.ObjectId(hotelId),
                            itemId: item._id,
                            name: v.name,
                            shortCode: v.shortCode.toUpperCase(),
                            price: v.price,
                            discountedPrice: v.discountedPrice,
                            preparationTimeMinutes: v.preparationTimeMinutes,
                            sortOrder: v.sortOrder ?? 0,
                        }));

                        await VariantModel.insertMany(variantDocs, { session });

                        const priceRange = calculateVariantPriceRange(dto.variants!);
                        item.minVariantPrice = priceRange.minVariantPrice;
                        item.maxVariantPrice = priceRange.maxVariantPrice;
                        item.price = undefined;
                        item.discountedPrice = undefined;
                    } else {
                        // Converting to non-variant: set price from dto (validator requires price when variants is [])
                        item.minVariantPrice = undefined;
                        item.maxVariantPrice = undefined;
                        item.price = dto.price ?? undefined;
                        item.discountedPrice = dto.discountedPrice ?? undefined;
                    }

                    await item.save({ session });
                });
            } else {
                // No variants involved — update direct pricing and save (single write)
                if (!item.hasVariants) {
                    if (dto.price !== undefined) {
                        item.price = dto.price ?? undefined;
                        item.markModified("price");
                    }
                    if (dto.discountedPrice !== undefined) {
                        item.discountedPrice = dto.discountedPrice ?? undefined;
                        item.markModified("discountedPrice");
                    }
                }
                await item.save();
            }

            // Invalidate cache FIRST so the subsequent getItemById reads fresh data from DB
            await invalidateMenuCache(hotelId);

            // Fetch the fully updated item (cache was just cleared, so this hits the DB)
            const updatedItem = await this.getItemById(hotelId, itemId);
            if (!updatedItem.success) {
                return updatedItem;
            }

            if (auditContext) {
                publishAuditEvent(
                    "MENU_ITEM_UPDATED",
                    "MENU_ITEM",
                    itemId,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId } }
                ).catch((err) => logger.error("Audit publish failed:", err));
            }

            logger.info(`Item updated: ${itemId}`);

            return updatedItem;
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                return { success: false, message: "Item with this short code already exists" };
            }
            logger.error("Error updating item:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to update item",
            };
        }
    };

    /**
     * Toggle item active status
     */
    toggleItem = async (hotelId: string, itemId: string, auditContext?: MenuAuditContext): Promise<ToggleResult> => {
        try {
            const item = await ItemModel.findOne({
                _id: new Types.ObjectId(itemId),
                hotelId: new Types.ObjectId(hotelId),
            });

            if (!item) {
                return { success: false, message: "Item not found" };
            }

            item.isActive = !item.isActive;
            await item.save();

            // Invalidate cache
            await invalidateMenuCache(hotelId);

            if (auditContext) {
                publishAuditEvent(
                    "MENU_ITEM_AVAILABILITY_CHANGED",
                    "MENU_ITEM",
                    itemId,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { isActive: item.isActive } }
                ).catch((err) => logger.error("Audit publish failed:", err));
            }

            logger.info(`Item toggled: ${itemId}, isActive: ${item.isActive}`);

            return {
                success: true,
                message: `Item ${item.isActive ? "activated" : "deactivated"} successfully`,
                isActive: item.isActive,
            };
        } catch (error) {
            logger.error("Error toggling item:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Failed to toggle item",
            };
        }
    };

    // ==================== VARIANT OPERATIONS ====================

    /**
     * Get variants for an item
     */
    getVariants = async (
        hotelId: string,
        itemId: string
    ): Promise<ServiceResult<IVariant[]>> => {
        // Verify item exists
        const item = await ItemModel.findOne({
            _id: new Types.ObjectId(itemId),
            hotelId: new Types.ObjectId(hotelId),
        }).lean();

        if (!item) {
            return { success: false, message: "Item not found" };
        }

        if (!item.hasVariants) {
            return { success: true, data: [] };
        }

        const redis = getRedis();
        const cacheKey = CACHE_KEYS.VARIANTS_LIST(hotelId, itemId);

        // Check cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return { success: true, data: JSON.parse(cached) };
        }

        const variants = await VariantModel.find({
            itemId: new Types.ObjectId(itemId),
            hotelId: new Types.ObjectId(hotelId),
        })
            .sort({ sortOrder: 1 })
            .lean();

        // Cache result
        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(variants));

        return { success: true, data: variants as unknown as IVariant[] };
    };

    // ==================== FULL MENU ====================

    /**
     * Get full menu with nested categories, items, and variants.
     * Supports super-search: search text, categoryIds, minPrice, maxPrice, type, isPopular, activeOnly.
     */
    getFullMenu = async (
        hotelId: string,
        options: GetFullMenuOptions = {}
    ): Promise<ServiceResult<IFullMenu>> => {
        const {
            search,
            categoryIds,
            minPrice,
            maxPrice,
            type,
            isPopular,
            activeOnly = true,
        } = options;
        const includeInactive = activeOnly === false;

        const hasFilters = Boolean(
            search?.trim() ||
            (categoryIds?.length ?? 0) > 0 ||
            minPrice != null ||
            maxPrice != null ||
            type ||
            isPopular !== undefined
        );

        const redis = getRedis();
        const cacheKey = `${CACHE_KEYS.FULL_MENU(hotelId)}:${includeInactive}`;

        if (!hasFilters) {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return { success: true, data: JSON.parse(cached) };
            }
        }

        const categoryFilter: Record<string, unknown> = {
            hotelId: new Types.ObjectId(hotelId),
        };
        if (!includeInactive) {
            categoryFilter.isActive = true;
        }

        const categories = await CategoryModel.find(categoryFilter)
            .populate("image", "url type")
            .sort({ sortOrder: 1 })
            .lean();

        const itemFilter: Record<string, unknown> = {
            hotelId: new Types.ObjectId(hotelId),
        };
        if (!includeInactive) {
            itemFilter.isActive = true;
        }

        const items = await ItemModel.find(itemFilter)
            .populate("image", "url type")
            .sort({ sortOrder: 1 })
            .lean();

        const itemsWithVariants = items.filter((item) => item.hasVariants);
        const itemIds = itemsWithVariants.map((item) => item._id);

        const variants = await VariantModel.find({
            hotelId: new Types.ObjectId(hotelId),
            itemId: { $in: itemIds },
            ...(includeInactive ? {} : { isActive: true }),
        })
            .sort({ sortOrder: 1 })
            .lean();

        const variantMap = new Map<string, IVariant[]>();
        for (const variant of variants) {
            const itemIdStr = variant.itemId.toString();
            if (!variantMap.has(itemIdStr)) {
                variantMap.set(itemIdStr, []);
            }
            variantMap.get(itemIdStr)!.push(variant as unknown as IVariant);
        }

        const itemMap = new Map<string, IItemWithVariants[]>();
        for (const item of items) {
            const categoryIdStr = item.categoryId.toString();
            if (!itemMap.has(categoryIdStr)) {
                itemMap.set(categoryIdStr, []);
            }
            const itemWithVariants: IItemWithVariants = {
                ...(item as unknown as IItemWithVariants),
                variants: variantMap.get(item._id.toString()) || [],
            };
            itemMap.get(categoryIdStr)!.push(itemWithVariants);
        }

        let categoriesWithItems: ICategoryWithItems[] = categories.map((category) => ({
            ...(category as unknown as ICategoryWithItems),
            items: itemMap.get(category._id.toString()) || [],
        }));

        if (categoryIds?.length) {
            const idSet = new Set(categoryIds);
            categoriesWithItems = categoriesWithItems.filter((c) => idSet.has(c._id.toString()));
        }

        const searchLower = search?.trim().toLowerCase();
        categoriesWithItems = categoriesWithItems.map((category) => {
            let list = category.items.filter((item) => {
                if (minPrice != null || maxPrice != null) {
                    const low = item.hasVariants
                        ? (item.minVariantPrice ?? 0)
                        : (item.price ?? 0);
                    const high = item.hasVariants
                        ? (item.maxVariantPrice ?? 0)
                        : (item.price ?? 0);
                    if (minPrice != null && high < minPrice) return false;
                    if (maxPrice != null && low > maxPrice) return false;
                }
                if (type && item.type !== type) return false;
                if (isPopular !== undefined && item.isPopular !== isPopular) return false;
                if (searchLower) {
                    const categoryMatch = [category.name, category.description].some(
                        (t) => t && t.toLowerCase().includes(searchLower)
                    );
                    const itemMatch = [item.name, item.description, item.shortCode].some(
                        (t) => t && String(t).toLowerCase().includes(searchLower)
                    );
                    const variantMatch = item.variants.some(
                        (v) =>
                            v.name.toLowerCase().includes(searchLower) ||
                            (v.shortCode && v.shortCode.toLowerCase().includes(searchLower))
                    );
                    if (!categoryMatch && !itemMatch && !variantMatch) return false;
                }
                return true;
            });
            return { ...category, items: list };
        });

        categoriesWithItems = categoriesWithItems.filter((c) => c.items.length > 0);
        const totalItems = categoriesWithItems.reduce((sum, c) => sum + c.items.length, 0);

        const result: IFullMenu = {
            hotelId,
            categories: categoriesWithItems,
            totalCategories: categoriesWithItems.length,
            totalItems,
        };

        if (!hasFilters) {
            await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        }

        return { success: true, data: result };
    };

    // ==================== USER MENU (CUSTOMER-FACING) ====================

    /** Raw cached item: no isAvailable (computed per request). */
    private static rawUserMenuItem = (): {
        id: string;
        name: string;
        description?: string;
        price: number;
        discountedPrice?: number;
        image: string | null;
        hasVariants: boolean;
        availability?: IAvailability;
        type?: "veg" | "non-veg" | "egg";
        taxes?: ITaxEntry[];
    } => ({} as any);

    /**
     * Get menu for customer: active categories and items, single image URL per item,
     * min price for variant items, isAvailable computed per request using hotel timezone.
     * Raw menu (without isAvailable) is cached for 5 minutes.
     */
    getMenuForUser = async (
        hotelId: string,
        hotelTimezone: string
    ): Promise<ServiceResult<UserMenuResponse>> => {
        const redis = getRedis();
        const cacheKey = CACHE_KEYS.USER_MENU(hotelId);

        let raw: { categories: { id: string; name: string; image: string | null; items: ReturnType<typeof MenuService.rawUserMenuItem>[] }[] };
        const cached = await redis.get(cacheKey);
        if (cached) {
            raw = JSON.parse(cached);
        } else {
            const categories = await CategoryModel.find({
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
            const items = await ItemModel.find({
                hotelId: new Types.ObjectId(hotelId),
                categoryId: { $in: categoryIds },
                isActive: true,
            })
                .sort({ sortOrder: 1 })
                .select("categoryId name description price discountedPrice minVariantPrice hasVariants availability image type taxes")
                .lean();
            const itemImageIds = [...new Set(items.map((i) => i.image?.toString()).filter(Boolean) as string[])];
            const categoryImageIds = [...new Set(categories.map((c) => (c as { image?: Types.ObjectId }).image?.toString()).filter(Boolean) as string[])];
            const imageIds = [...new Set([...itemImageIds, ...categoryImageIds])];
            const urlMap = await attachmentService.getAttachmentUrlsByIds(imageIds);
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
                            const price = i.hasVariants ? (i.minVariantPrice ?? 0) : (i.price ?? 0);
                            return {
                                id: i._id.toString(),
                                name: i.name,
                                description: i.description ?? undefined,
                                price,
                                discountedPrice: i.discountedPrice ?? undefined,
                                image: (i.image && urlMap[i.image.toString()]) || null,
                                hasVariants: i.hasVariants ?? false,
                                availability: i.availability as IAvailability | undefined,
                                type: (i as { type?: "veg" | "non-veg" | "egg" }).type ?? "veg",
                                taxes: (i as { taxes?: ITaxEntry[] }).taxes ?? [],
                            };
                        }),
                    };
                }),
            };
            await redis.setEx(cacheKey, USER_MENU_TTL, JSON.stringify(raw));
        }

        const response: UserMenuResponse = {
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
                    isAvailable: isItemAvailable(it.availability, hotelTimezone),
                    hasVariants: it.hasVariants,
                    type: (it as { type?: "veg" | "non-veg" | "egg" }).type ?? "veg",
                    taxes: (it as { taxes?: ITaxEntry[] }).taxes ?? [],
                })) as UserMenuItem[],
            })) as UserMenuCategory[],
        };
        return { success: true, data: response };
    };

    /**
     * Item detail for customer (add-to-cart dialog): item + variants + suggested items.
     * Suggested items: from item.suggestedItemIds; if empty, from category.suggestedCategoryIds (items from those categories).
     * If a suggested item has variants, flatten to one entry per variant (id = variantId, itemId = item id).
     */
    getItemDetailForUser = async (
        hotelId: string,
        itemId: string,
        hotelTimezone: string
    ): Promise<ServiceResult<ItemDetailForCustomer>> => {
        const item = await ItemModel.findOne({
            _id: new Types.ObjectId(itemId),
            hotelId: new Types.ObjectId(hotelId),
            isActive: true,
        })
            .select("name description image price discountedPrice minVariantPrice hasVariants type availability categoryId suggestedItemIds taxes")
            .lean();
        if (!item) {
            return { success: false, message: "Item not found" };
        }

        const variants = await VariantModel.find({
            itemId: new Types.ObjectId(itemId),
            hotelId: new Types.ObjectId(hotelId),
            isActive: true,
        })
            .sort({ sortOrder: 1 })
            .select("name price discountedPrice")
            .lean();

        const itemAvailability = item.availability as IAvailability | undefined;
        const itemIsAvailable = isItemAvailable(itemAvailability, hotelTimezone);

        const variantList: ItemDetailVariant[] = variants.map((v) => ({
            id: v._id.toString(),
            name: v.name,
            price: v.price,
            discountedPrice: v.discountedPrice ?? undefined,
            isAvailable: itemIsAvailable,
        }));

        let suggestedItemIds: Types.ObjectId[] = (item.suggestedItemIds as Types.ObjectId[] | undefined) ?? [];
        if (suggestedItemIds.length === 0) {
            const category = await CategoryModel.findOne({
                _id: item.categoryId,
                hotelId: new Types.ObjectId(hotelId),
            })
                .select("suggestedCategoryIds")
                .lean();
            const catIds = (category?.suggestedCategoryIds as Types.ObjectId[] | undefined) ?? [];
            if (catIds.length > 0) {
                const itemsFromCategories = await ItemModel.find({
                    hotelId: new Types.ObjectId(hotelId),
                    categoryId: { $in: catIds },
                    isActive: true,
                    _id: { $ne: new Types.ObjectId(itemId) },
                })
                    .select("_id")
                    .limit(50)
                    .lean();
                suggestedItemIds = itemsFromCategories.map((i) => i._id);
            }
        }

        const suggestedItemsFlat: ItemDetailSuggestedItem[] = [];
        if (suggestedItemIds.length > 0) {
            const suggestedItems = await ItemModel.find({
                _id: { $in: suggestedItemIds },
                hotelId: new Types.ObjectId(hotelId),
                isActive: true,
            })
                .select("name price discountedPrice hasVariants type availability taxes")
                .lean();
            const suggestedIds = suggestedItems.map((s) => s._id.toString());
            const suggestedVariants = await VariantModel.find({
                itemId: { $in: suggestedItemIds },
                hotelId: new Types.ObjectId(hotelId),
                isActive: true,
            })
                .sort({ sortOrder: 1 })
                .select("itemId name price discountedPrice")
                .lean();
            const variantsByItemId = new Map<string, typeof suggestedVariants>();
            for (const v of suggestedVariants) {
                const key = v.itemId.toString();
                if (!variantsByItemId.has(key)) variantsByItemId.set(key, []);
                variantsByItemId.get(key)!.push(v);
            }
            for (const s of suggestedItems) {
                const sid = s._id.toString();
                const itemType = (s.type as "veg" | "non-veg" | "egg") ?? "veg";
                const sAvailability = s.availability as IAvailability | undefined;
                const sIsAvailable = isItemAvailable(sAvailability, hotelTimezone);
                const itemTaxes = (s as { taxes?: ITaxEntry[] }).taxes ?? [];
                if (s.hasVariants) {
                    const vList = variantsByItemId.get(sid) ?? [];
                    for (const v of vList) {
                        suggestedItemsFlat.push({
                            id: v._id.toString(),
                            itemId: sid,
                            name: `${s.name} ${v.name}`.trim(),
                            price: v.price,
                            discountedPrice: v.discountedPrice ?? undefined,
                            isAvailable: sIsAvailable,
                            type: itemType,
                            taxes: itemTaxes,
                        });
                    }
                } else {
                    suggestedItemsFlat.push({
                        id: sid,
                        itemId: sid,
                        name: s.name,
                        price: s.price ?? 0,
                        discountedPrice: s.discountedPrice ?? undefined,
                        isAvailable: sIsAvailable,
                        type: itemType,
                        taxes: itemTaxes,
                    });
                }
            }
        }

        const imageIds = item.image ? [item.image.toString()] : [];
        const urlMap = imageIds.length > 0 ? await attachmentService.getAttachmentUrlsByIds(imageIds) : {};
        const imageUrl = item.image ? (urlMap[item.image.toString()] ?? null) : null;

        const price = item.hasVariants ? (item.minVariantPrice ?? 0) : (item.price ?? 0);
        const discountedPrice = item.discountedPrice ?? undefined;

        return {
            success: true,
            data: {
                id: item._id.toString(),
                name: item.name,
                price,
                discountedPrice,
                description: item.description ?? undefined,
                image: imageUrl,
                isAvailable: itemIsAvailable,
                type: (item.type as "veg" | "non-veg" | "egg") ?? "veg",
                taxes: (item as { taxes?: ITaxEntry[] }).taxes ?? [],
                variants: variantList,
                suggestedItems: suggestedItemsFlat,
            },
        };
    };

    /**
     * Resolve and validate menu items for order placement (DDD: used by orders module).
     * Validates item exists, belongs to hotel, is active; validates price/discountedPrice (incl. variant).
     * Returns canonical item data with taxes for bill calculation. Throws on validation failure.
     */
    getItemsWithTaxes = async (
        hotelId: string,
        items: GetItemsWithTaxesInput[]
    ): Promise<GetItemsWithTaxesResult[]> => {
        if (items.length === 0) return [];

        const round2 = (n: number) => Math.round(n * 100) / 100;
        const hotelOid = new Types.ObjectId(hotelId);
        const itemIds = [...new Set(items.map((i) => i.itemId))];

        const dbItems = await ItemModel.find({
            _id: { $in: itemIds.map((id) => new Types.ObjectId(id)) },
            hotelId: hotelOid,
            isActive: true,
        })
            .select("_id name price discountedPrice hasVariants taxes")
            .lean();

        const itemMap = new Map<string, (typeof dbItems)[0]>();
        for (const i of dbItems) itemMap.set((i._id as Types.ObjectId).toString(), i);

        const variantItemIds = items.filter((i) => i.variantId).map((i) => i.itemId);
        let variantsByItemId = new Map<string, Array<{ _id: Types.ObjectId; itemId: Types.ObjectId; name: string; price: number; discountedPrice?: number }>>();
        if (variantItemIds.length > 0) {
            const variantIds = items.map((i) => i.variantId).filter(Boolean) as string[];
            const variants = await VariantModel.find({
                _id: { $in: variantIds.map((id) => new Types.ObjectId(id)) },
                hotelId: hotelOid,
                itemId: { $in: variantItemIds.map((id) => new Types.ObjectId(id)) },
                isActive: true,
            })
                .select("_id itemId name price discountedPrice")
                .lean();
            for (const v of variants) {
                const key = (v.itemId as Types.ObjectId).toString();
                if (!variantsByItemId.has(key)) variantsByItemId.set(key, []);
                variantsByItemId.get(key)!.push(v as { _id: Types.ObjectId; itemId: Types.ObjectId; name: string; price: number; discountedPrice?: number });
            }
        }

        const result: GetItemsWithTaxesResult[] = [];
        for (const line of items) {
            const dbItem = itemMap.get(line.itemId);
            if (!dbItem) {
                throw new Error(`Item not found or inactive: ${line.itemId}`);
            }
            const hasVariants = (dbItem as { hasVariants?: boolean }).hasVariants ?? false;
            const variantId = line.variantId?.trim();
            const variantName = line.variantName?.trim();

            if (hasVariants && !variantId) {
                throw new Error(`Item ${line.itemId} has variants; variantId is required`);
            }
            if (!hasVariants && variantId) {
                throw new Error(`Item ${line.itemId} does not have variants; variantId must not be sent`);
            }

            let unitPrice: number;
            let unitDiscountedPrice: number | undefined;
            let name: string;

            if (variantId) {
                const list = variantsByItemId.get(line.itemId) ?? [];
                const variant = list.find((v) => (v._id as Types.ObjectId).toString() === variantId);
                if (!variant) {
                    throw new Error(`Variant not found or inactive: ${variantId} for item ${line.itemId}`);
                }
                unitPrice = variant.price;
                unitDiscountedPrice = variant.discountedPrice;
                name = `${dbItem.name} ${variant.name}`.trim();
            } else {
                unitPrice = (dbItem.price as number) ?? 0;
                unitDiscountedPrice = dbItem.discountedPrice as number | undefined;
                name = dbItem.name as string;
            }

            const clientPrice = round2(line.price);
            const clientDiscounted = line.discountedPrice != null ? round2(line.discountedPrice) : undefined;
            const dbPrice = round2(unitPrice);
            const dbDiscounted = unitDiscountedPrice != null ? round2(unitDiscountedPrice) : undefined;

            if (clientPrice !== dbPrice) {
                throw new Error(`Price mismatch for item ${line.itemId}${variantId ? ` variant ${variantId}` : ""}: expected ${dbPrice}, got ${clientPrice}`);
            }
            if (clientDiscounted !== undefined) {
                if (dbDiscounted === undefined) {
                    throw new Error(`Item ${line.itemId} does not have a discounted price`);
                }
                if (clientDiscounted !== dbDiscounted) {
                    throw new Error(`Discounted price mismatch for item ${line.itemId}: expected ${dbDiscounted}, got ${clientDiscounted}`);
                }
            }

            const taxes = (dbItem as { taxes?: ITaxEntry[] }).taxes ?? [];
            result.push({
                itemId: line.itemId,
                itemName: name,
                price: unitPrice,
                discountedPrice: unitDiscountedPrice,
                quantity: line.quantity,
                variantId: variantId || undefined,
                variantName: variantName || undefined,
                isUpsell: line.isUpsell ?? false,
                taxes,
            });
        }
        return result;
    };
}

export default new MenuService();
