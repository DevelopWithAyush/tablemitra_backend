import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
    CreateAdminValidation,
    UpdateAdminValidation,
    GetAdminByIdValidation,
    DeleteAdminValidation,
    CreateCustomerCareValidation,
    UpdateCustomerCareValidation,
    GetCustomerCareByIdValidation,
    DeleteCustomerCareValidation,
    CreateSalesValidation,
    UpdateSalesValidation,
    GetSalesByIdValidation,
    DeleteSalesValidation,
} from "./validator/company.validator.js";
import * as companyController from "./company.controller.js";

const companyRoutes = Router({ mergeParams: true });

// Apply auth middleware to all routes
companyRoutes.use(authMiddleware);

// ==================== ADMIN ROUTES ====================

companyRoutes.get(
    "/admins",
    requirePermissions("MANAGE_ADMINS"),
    companyController.getAdmins
);

companyRoutes.get(
    "/admins/:id",
    requirePermissions("MANAGE_ADMINS"),
    validate(GetAdminByIdValidation),
    companyController.getAdminById
);

companyRoutes.post(
    "/admins",
    requirePermissions("MANAGE_ADMINS"),
    validate(CreateAdminValidation),
    companyController.createAdmin
);

companyRoutes.patch(
    "/admins/:id",
    requirePermissions("MANAGE_ADMINS"),
    validate(UpdateAdminValidation),
    companyController.updateAdmin
);

companyRoutes.delete(
    "/admins/:id",
    requirePermissions("MANAGE_ADMINS"),
    validate(DeleteAdminValidation),
    companyController.deleteAdmin
);

// ==================== CUSTOMER CARE ROUTES ====================

companyRoutes.get(
    "/customer-care",
    requirePermissions("MANAGE_CUSTOMER_CARE"),
    companyController.getCustomerCareList
);

companyRoutes.get(
    "/customer-care/:id",
    requirePermissions("MANAGE_CUSTOMER_CARE"),
    validate(GetCustomerCareByIdValidation),
    companyController.getCustomerCareById
);

companyRoutes.post(
    "/customer-care",
    requirePermissions("MANAGE_CUSTOMER_CARE"),
    validate(CreateCustomerCareValidation),
    companyController.createCustomerCare
);

companyRoutes.patch(
    "/customer-care/:id",
    requirePermissions("MANAGE_CUSTOMER_CARE"),
    validate(UpdateCustomerCareValidation),
    companyController.updateCustomerCare
);

companyRoutes.delete(
    "/customer-care/:id",
    requirePermissions("MANAGE_CUSTOMER_CARE"),
    validate(DeleteCustomerCareValidation),
    companyController.deleteCustomerCare
);

// ==================== SALES ROUTES ====================

companyRoutes.get(
    "/sales",
    requirePermissions("MANAGE_SALES"),
    companyController.getSalesList
);

companyRoutes.get(
    "/sales/:id",
    requirePermissions("MANAGE_SALES"),
    validate(GetSalesByIdValidation),
    companyController.getSalesById
);

companyRoutes.post(
    "/sales",
    requirePermissions("MANAGE_SALES"),
    validate(CreateSalesValidation),
    companyController.createSales
);

companyRoutes.patch(
    "/sales/:id",
    requirePermissions("MANAGE_SALES"),
    validate(UpdateSalesValidation),
    companyController.updateSales
);

companyRoutes.delete(
    "/sales/:id",
    requirePermissions("MANAGE_SALES"),
    validate(DeleteSalesValidation),
    companyController.deleteSales
);

export default companyRoutes;
