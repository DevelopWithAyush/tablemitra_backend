import { Router } from "express";
  
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
    createCategory,
    createItem,
    getCategories,
    getFullMenu,
    getItemDetail,
    getItems,
    getVariants,
    toggleCategory,
    toggleItem,
    updateCategory,
    updateItem
} from "./menu.controller.js";
import {
    CreateCategoryValidation,
    CreateItemValidation,
    GetCategoriesValidation,
    GetFullMenuValidation,
    GetItemByIdValidation,
    GetItemsValidation,
    GetVariantsValidation,
    ToggleCategoryValidation,
    ToggleItemValidation,
    UpdateCategoryValidation,
    UpdateItemValidation,
} from "./validator/menu.validator.js";

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

// Get item by ID (full detail for edit page – variants, suggestions, category)
menuRoutes.get(
    "/items/:itemId",
    requirePermissions("VIEW_MENU"),
    validate(GetItemByIdValidation),
    getItemDetail
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



// menuRoutes.get("/user/menu", requirePermissions("VIEW_MENU"), getUserMenu);

export default menuRoutes;
