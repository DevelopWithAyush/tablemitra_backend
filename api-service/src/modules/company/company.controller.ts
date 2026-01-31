import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import companyService from "./company.service.js";
import {
    CreateAdminSchema,
    UpdateAdminSchema,
    CreateCustomerCareSchema,
    UpdateCustomerCareSchema,
    CreateSalesSchema,
    UpdateSalesSchema,
    PaginationSchema,
} from "./validator/company.validator.js";

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
    const { id } = req.params;
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
    const result = await companyService.createAdmin(dto);

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
    const { id } = req.params;
    const dto = UpdateAdminSchema.parse(req.body);
    const result = await companyService.updateAdmin(id, dto);

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
    const { id } = req.params;
    const result = await companyService.deleteAdmin(id);

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
    const { id } = req.params;
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
    const result = await companyService.createCustomerCare(dto);

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
    const { id } = req.params;
    const dto = UpdateCustomerCareSchema.parse(req.body);
    const result = await companyService.updateCustomerCare(id, dto);

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
    const { id } = req.params;
    const result = await companyService.deleteCustomerCare(id);

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
    const { id } = req.params;
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
    const result = await companyService.createSales(dto);

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
    const { id } = req.params;
    const dto = UpdateSalesSchema.parse(req.body);
    const result = await companyService.updateSales(id, dto);

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
    const { id } = req.params;
    const result = await companyService.deleteSales(id);

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
