import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
    GetCategoriesValidation,
    CreateCategoryValidation,
    UpdateCategoryValidation,
    ToggleCategoryValidation,
    GetServicesValidation,
    CreateServiceValidation,
    UpdateServiceValidation,
    ToggleServiceValidation,
    GetFullCatalogValidation,
} from "./validator/service.validator.js";
import {
    getCategories,
    createCategory,
    updateCategory,
    toggleCategory,
    getServices,
    createService,
    updateService,
    toggleService,
    getFullCatalog,
} from "./service.controller.js";

const serviceRoutes = Router({ mergeParams: true });

// Auth middleware - uses req.params.app
serviceRoutes.use(authMiddleware);

// ==================== CATEGORY ROUTES ====================

// Get all categories (paginated)
serviceRoutes.get(
    "/categories",
    requirePermissions("VIEW_SERVICE"),
    validate(GetCategoriesValidation),
    getCategories
);

// Create a new category
serviceRoutes.post(
    "/categories",
    requirePermissions("CREATE_SERVICE"),
    validate(CreateCategoryValidation),
    createCategory
);

// Update a category
serviceRoutes.put(
    "/categories/:categoryId",
    requirePermissions("UPDATE_SERVICE"),
    validate(UpdateCategoryValidation),
    updateCategory
);

// Toggle category active status
serviceRoutes.put(
    "/categories/:categoryId/toggle",
    requirePermissions("UPDATE_SERVICE"),
    validate(ToggleCategoryValidation),
    toggleCategory
);

// ==================== SERVICE ROUTES ====================

// Get services in a category (paginated)
serviceRoutes.get(
    "/categories/:categoryId/services",
    requirePermissions("VIEW_SERVICE"),
    validate(GetServicesValidation),
    getServices
);

// Create a new service
serviceRoutes.post(
    "/categories/:categoryId/services",
    requirePermissions("CREATE_SERVICE"),
    validate(CreateServiceValidation),
    createService
);

// Update a service
serviceRoutes.put(
    "/services/:serviceId",
    requirePermissions("UPDATE_SERVICE"),
    validate(UpdateServiceValidation),
    updateService
);

// Toggle service active status
serviceRoutes.put(
    "/services/:serviceId/toggle",
    requirePermissions("UPDATE_SERVICE"),
    validate(ToggleServiceValidation),
    toggleService
);

// ==================== FULL CATALOG ROUTES ====================

// Get full service catalog (nested structure)
serviceRoutes.get(
    "/all-services",
    requirePermissions("VIEW_SERVICE"),
    validate(GetFullCatalogValidation),
    getFullCatalog
);

export default serviceRoutes;
