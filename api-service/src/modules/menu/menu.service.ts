import { Types } from "mongoose";
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
    PaginatedResult,
    ToggleResult,
    ICategory,
    IItem,
    IVariant,
    IItemWithVariants,
    ICategoryWithItems,
    IFullMenu,
    VariantPriceRange,
} from "./menu.types.js";
import logger from "../../helpers/logger/index.js";

// ==================== CACHE CONFIGURATION ====================

const CACHE_KEYS = {
    CATEGORIES_LIST: (hotelId: string) => `menu:${hotelId}:categories:list`,
    CATEGORY_BY_ID: (hotelId: string, categoryId: string) => `menu:${hotelId}:categories:${categoryId}`,
    ITEMS_LIST: (hotelId: string, categoryId: string) => `menu:${hotelId}:categories:${categoryId}:items:list`,
    ITEM_BY_ID: (hotelId: string, itemId: string) => `menu:${hotelId}:items:${itemId}`,
    VARIANTS_LIST: (hotelId: string, itemId: string) => `menu:${hotelId}:items:${itemId}:variants`,
    FULL_MENU: (hotelId: string) => `menu:${hotelId}:full`,
};

const CACHE_TTL = 1800; // 30 minutes

// ==================== HELPER FUNCTIONS ====================

const buildListCacheKey = (base: string, options: PaginationDTO): string => {
    const { page = 1, limit = 20, search = "", isActive, type, isPopular } = options;
    return `${base}:${page}:${limit}:${search}:${isActive ?? "all"}:${type ?? "all"}:${isPopular ?? "all"}`;
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
            CategoryModel.find(filter)
                .populate("image", "url type")
                .sort({ sortOrder: 1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            CategoryModel.countDocuments(filter),
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
        dto: CreateCategoryDTO
    ): Promise<ServiceResult<ICategory>> => {
        try {
            // Check for duplicate name in same hotel
            const existingCategory = await CategoryModel.findOne({
                hotelId: new Types.ObjectId(hotelId),
                name: { $regex: new RegExp(`^${dto.name}$`, "i") },
            });

            if (existingCategory) {
                return { success: false, message: "Category with this name already exists" };
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

            logger.info(`Category created: ${category._id} for hotel: ${hotelId}`);

            return {
                success: true,
                data: category.toObject() as unknown as ICategory,
            };
        } catch (error) {
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
        dto: UpdateCategoryDTO
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
            if (dto.suggestedCategoryIds !== undefined) {
                category.suggestedCategoryIds = dto.suggestedCategoryIds.map(
                    (id) => new Types.ObjectId(id) as any
                );
            }

            await category.save();

            // Invalidate cache
            await invalidateMenuCache(hotelId);

            logger.info(`Category updated: ${categoryId}`);

            return {
                success: true,
                data: category.toObject() as unknown as ICategory,
            };
        } catch (error) {
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
    toggleCategory = async (hotelId: string, categoryId: string): Promise<ToggleResult> => {
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
    ): Promise<ServiceResult<PaginatedResult<IItem>>> => {
        // Verify category exists and belongs to hotel
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

        // Check cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return { success: true, data: JSON.parse(cached) };
        }

        const { page = 1, limit = 20, search, isActive, type, isPopular } = options;
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
        if (type) filter.type = type;
        if (isPopular !== undefined) filter.isPopular = isPopular;

        // Execute query
        const [items, total] = await Promise.all([
            ItemModel.find(filter)
                .populate("image", "url type")
                .sort({ sortOrder: 1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ItemModel.countDocuments(filter),
        ]);

        const result: PaginatedResult<IItem> = {
            data: items as unknown as IItem[],
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
     * Create a new item with optional variants
     */
    createItem = async (
        hotelId: string,
        categoryId: string,
        dto: CreateItemDTO
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

            const hasVariants = dto.variants && dto.variants.length > 0;

            // Calculate variant price range
            let variantPriceRange: VariantPriceRange | undefined;
            if (hasVariants && dto.variants) {
                variantPriceRange = calculateVariantPriceRange(dto.variants);
            }

            // Create item
            const item = await ItemModel.create({
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
                suggestedItemIds: dto.suggestedItemIds?.map((id) => new Types.ObjectId(id)),
            });

            // Create variants if provided
            let variants: IVariant[] = [];
            if (hasVariants && dto.variants) {
                const variantDocs = dto.variants.map((v) => ({
                    hotelId: new Types.ObjectId(hotelId),
                    itemId: item._id,
                    name: v.name,
                    shortCode: v.shortCode.toUpperCase(),
                    price: v.price,
                    discountedPrice: v.discountedPrice,
                    preparationTimeMinutes: v.preparationTimeMinutes,
                    sortOrder: v.sortOrder ?? 0,
                }));

                const createdVariants = await VariantModel.insertMany(variantDocs);
                variants = createdVariants.map((v) => v.toObject()) as unknown as IVariant[];
            }

            // Invalidate cache
            await invalidateMenuCache(hotelId);

            logger.info(`Item created: ${item._id} for hotel: ${hotelId}`);

            return {
                success: true,
                data: {
                    ...(item.toObject() as unknown as IItemWithVariants),
                    variants,
                },
            };
        } catch (error) {
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
        dto: UpdateItemDTO
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
                item.availability = dto.availability || undefined;
            }
            if (dto.suggestedItemIds !== undefined) {
                item.suggestedItemIds = dto.suggestedItemIds.map((id) => new Types.ObjectId(id) as any);
            }

            // Handle variants update
            if (dto.variants !== undefined) {
                const hasVariants = dto.variants.length > 0;
                item.hasVariants = hasVariants;

                if (hasVariants) {
                    // Delete existing variants
                    await VariantModel.deleteMany({
                        itemId: new Types.ObjectId(itemId),
                        hotelId: new Types.ObjectId(hotelId),
                    });

                    // Create new variants
                    const variantDocs = dto.variants.map((v) => ({
                        hotelId: new Types.ObjectId(hotelId),
                        itemId: item._id,
                        name: v.name,
                        shortCode: v.shortCode.toUpperCase(),
                        price: v.price,
                        discountedPrice: v.discountedPrice,
                        preparationTimeMinutes: v.preparationTimeMinutes,
                        sortOrder: v.sortOrder ?? 0,
                    }));

                    await VariantModel.insertMany(variantDocs);

                    // Update price range
                    const priceRange = calculateVariantPriceRange(dto.variants);
                    item.minVariantPrice = priceRange.minVariantPrice;
                    item.maxVariantPrice = priceRange.maxVariantPrice;
                    item.price = undefined;
                    item.discountedPrice = undefined;
                } else {
                    // Remove all variants and use direct pricing
                    await VariantModel.deleteMany({
                        itemId: new Types.ObjectId(itemId),
                        hotelId: new Types.ObjectId(hotelId),
                    });
                    item.minVariantPrice = undefined;
                    item.maxVariantPrice = undefined;
                }
            } else {
                // Update direct pricing if not using variants
                if (!item.hasVariants) {
                    if (dto.price !== undefined) item.price = dto.price ?? undefined;
                    if (dto.discountedPrice !== undefined) {
                        item.discountedPrice = dto.discountedPrice ?? undefined;
                    }
                }
            }

            await item.save();

            // Fetch updated item with variants
            const updatedItem = await this.getItemById(hotelId, itemId);
            if (!updatedItem.success) {
                return updatedItem;
            }

            // Invalidate cache
            await invalidateMenuCache(hotelId);

            logger.info(`Item updated: ${itemId}`);

            return updatedItem;
        } catch (error) {
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
    toggleItem = async (hotelId: string, itemId: string): Promise<ToggleResult> => {
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
     * Get full menu with nested categories, items, and variants
     */
    getFullMenu = async (
        hotelId: string,
        includeInactive = false
    ): Promise<ServiceResult<IFullMenu>> => {
        const redis = getRedis();
        const cacheKey = `${CACHE_KEYS.FULL_MENU(hotelId)}:${includeInactive}`;

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
        const categories = await CategoryModel.find(categoryFilter)
            .populate("image", "url type")
            .sort({ sortOrder: 1 })
            .lean();

        // Build item filter
        const itemFilter: Record<string, unknown> = {
            hotelId: new Types.ObjectId(hotelId),
        };
        if (!includeInactive) {
            itemFilter.isActive = true;
        }

        // Get all items
        const items = await ItemModel.find(itemFilter)
            .populate("image", "url type")
            .sort({ sortOrder: 1 })
            .lean();

        // Get all variants for items with variants
        const itemsWithVariants = items.filter((item) => item.hasVariants);
        const itemIds = itemsWithVariants.map((item) => item._id);

        const variants = await VariantModel.find({
            hotelId: new Types.ObjectId(hotelId),
            itemId: { $in: itemIds },
            ...(includeInactive ? {} : { isActive: true }),
        })
            .sort({ sortOrder: 1 })
            .lean();

        // Create variant map for quick lookup
        const variantMap = new Map<string, IVariant[]>();
        for (const variant of variants) {
            const itemIdStr = variant.itemId.toString();
            if (!variantMap.has(itemIdStr)) {
                variantMap.set(itemIdStr, []);
            }
            variantMap.get(itemIdStr)!.push(variant as unknown as IVariant);
        }

        // Create item map for quick lookup by category
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

        // Build nested response
        const categoriesWithItems: ICategoryWithItems[] = categories.map((category) => ({
            ...(category as unknown as ICategoryWithItems),
            items: itemMap.get(category._id.toString()) || [],
        }));

        const result: IFullMenu = {
            hotelId,
            categories: categoriesWithItems,
            totalCategories: categories.length,
            totalItems: items.length,
        };

        // Cache result
        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));

        return { success: true, data: result };
    };
}

export default new MenuService();
