import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import companyService from "./company.service.js";
import type { CompanyAuditContext } from "./company.types.js";
import type { IJwtPayload } from "../auth/auth.types.js";
import type { ActorRole } from "../audit/audit.types.js";
import {
    CreateAdminSchema,
    UpdateAdminSchema,
    CreateCustomerCareSchema,
    UpdateCustomerCareSchema,
    CreateSalesSchema,
    UpdateSalesSchema,
    PaginationSchema,
} from "./validator/company.validator.js";

function getAuditContext(req: Request): CompanyAuditContext {
    const user = (req as Request & { user: IJwtPayload }).user;
    const app = req.params.app;
    const panel = typeof app === "string" ? app : app?.[0];
    return {
        actor: { userId: user.sub, role: "ADMIN" as ActorRole },
        context: { ip: req.ip, userAgent: req.get("User-Agent") ?? undefined, panel },
    };
}

// ==================== ADMIN CONTROLLERS ====================

export const getAdmins = asyncHandler(async (req: Request, res: Response) => {
    const query = PaginationSchema.parse(req.query);
    const result = await companyService.getAdmins(query);

    return res.json({
        success: true,
        ...result,
    });
});

export const getAdminById = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const result = await companyService.getAdminById(id);

    if (!result.success) {
        return res.status(404).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        data: result.profile,
    });
});

export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
    const dto = CreateAdminSchema.parse(req.body);
    const result = await companyService.createAdmin(dto, getAuditContext(req));

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.status(201).json({
        success: true,
        message: "Admin onboarded successfully",
        data: result.profile,
    });
});

export const updateAdmin = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const dto = UpdateAdminSchema.parse(req.body);
    const result = await companyService.updateAdmin(id, dto, getAuditContext(req));

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: "Admin updated successfully",
        data: result.profile,
    });
});

export const deleteAdmin = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const result = await companyService.deleteAdmin(id, getAuditContext(req));

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: result.message,
    });
});

// ==================== CUSTOMER CARE CONTROLLERS ====================

export const getCustomerCareList = asyncHandler(async (req: Request, res: Response) => {
    const query = PaginationSchema.parse(req.query);
    const result = await companyService.getCustomerCareList(query);

    return res.json({
        success: true,
        ...result,
    });
});

export const getCustomerCareById = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const result = await companyService.getCustomerCareById(id);

    if (!result.success) {
        return res.status(404).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        data: result.profile,
    });
});

export const createCustomerCare = asyncHandler(async (req: Request, res: Response) => {
    const dto = CreateCustomerCareSchema.parse(req.body);
    const result = await companyService.createCustomerCare(dto, getAuditContext(req));

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.status(201).json({
        success: true,
        message: "Customer care onboarded successfully",
        data: result.profile,
    });
});

export const updateCustomerCare = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const dto = UpdateCustomerCareSchema.parse(req.body);
    const result = await companyService.updateCustomerCare(id, dto, getAuditContext(req));

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: "Customer care updated successfully",
        data: result.profile,
    });
});

export const deleteCustomerCare = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const result = await companyService.deleteCustomerCare(id, getAuditContext(req));

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: result.message,
    });
});

// ==================== SALES CONTROLLERS ====================

export const getSalesList = asyncHandler(async (req: Request, res: Response) => {
    const query = PaginationSchema.parse(req.query);
    const result = await companyService.getSalesList(query);

    return res.json({
        success: true,
        ...result,
    });
});

export const getSalesById = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const result = await companyService.getSalesById(id);

    if (!result.success) {
        return res.status(404).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        data: result.profile,
    });
});

export const createSales = asyncHandler(async (req: Request, res: Response) => {
    const dto = CreateSalesSchema.parse(req.body);
    const result = await companyService.createSales(dto, getAuditContext(req));

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.status(201).json({
        success: true,
        message: "Sales person onboarded successfully",
        data: result.profile,
    });
});

export const updateSales = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const dto = UpdateSalesSchema.parse(req.body);
    const result = await companyService.updateSales(id, dto, getAuditContext(req));

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: "Sales person updated successfully",
        data: result.profile,
    });
});

export const deleteSales = asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "";
    const result = await companyService.deleteSales(id, getAuditContext(req));

    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.message,
        });
    }

    return res.json({
        success: true,
        message: result.message,
    });
});
