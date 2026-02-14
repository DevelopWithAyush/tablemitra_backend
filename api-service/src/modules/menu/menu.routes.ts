import { Router } from "express";
  
import { requirePermissions } from "../../middleware/permission.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
    GetCategoriesValidation,
    CreateCategoryValidation,
    UpdateCategoryValidation,
    ToggleCategoryValidation,
    GetItemsValidation,
    CreateItemValidation,
    UpdateItemValidation,
    ToggleItemValidation,
    GetVariantsValidation,
    GetFullMenuValidation,
} from "./validator/menu.validator.js";
import {
    getCategories,
    createCategory,
    updateCategory,
    toggleCategory,
    getItems,
    createItem,
    updateItem,
    toggleItem,
    getVariants,
    getFullMenu,
} from "./menu.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";

const menuRoutes = Router({ mergeParams: true });

// Auth middleware - uses req.params.app
menuRoutes.use(authMiddleware);

// ==================== CATEGORY ROUTES ====================

// Get all categories (paginated)
menuRoutes.get(
    "/categories",
    requirePermissions("VIEW_MENU"),
    validate(GetCategoriesValidation),
    getCategories
);

// Create a new category
menuRoutes.post(
    "/categories",
    requirePermissions("CREATE_MENU"),
    validate(CreateCategoryValidation),
    createCategory
);

// Update a category
menuRoutes.put(
    "/categories/:categoryId",
    requirePermissions("UPDATE_MENU"),
    validate(UpdateCategoryValidation),
    updateCategory
);

// Toggle category active status
menuRoutes.put(
    "/categories/:categoryId/toggle",
    requirePermissions("UPDATE_MENU"),
    validate(ToggleCategoryValidation),
    toggleCategory
);

// ==================== ITEM ROUTES ====================

// Get items in a category (paginated)
menuRoutes.get(
    "/categories/:categoryId/items",
    requirePermissions("VIEW_MENU"),
    validate(GetItemsValidation),
    getItems
);

// Create a new item (with optional variants)
menuRoutes.post(
    "/categories/:categoryId/items",
    requirePermissions("CREATE_MENU"),
    validate(CreateItemValidation),
    createItem
);

// Update an item
menuRoutes.put(
    "/items/:itemId",
    requirePermissions("UPDATE_MENU"),
    validate(UpdateItemValidation),
    updateItem
);

// Toggle item active status
menuRoutes.put(
    "/items/:itemId/toggle",
    requirePermissions("UPDATE_MENU"),
    validate(ToggleItemValidation),
    toggleItem
);

// ==================== VARIANT ROUTES ====================

// Get variants for an item
menuRoutes.get(
    "/items/:itemId/variants",
    requirePermissions("VIEW_MENU"),
    validate(GetVariantsValidation),
    getVariants
);

// ==================== FULL MENU ROUTES ====================

// Get full menu (nested structure)
menuRoutes.get(
    "/menu-items",
    requirePermissions("VIEW_MENU"),
    validate(GetFullMenuValidation),
    getFullMenu
);

export default menuRoutes;
