import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { sendErrorResponse } from "../utils/error-response.js";

const AppSchema = z.enum([
    "admin",
    "sales",
    "customer-care",
    "founder",
    "manager",
    "frontdesk",
    "kitchen",
    "room-service",
    "customer"
]);

export function appValidator(req: Request, res: Response, next: NextFunction) {
    const result = AppSchema.safeParse(req.params.app);

    if (!result.success) {
        return sendErrorResponse(res, 404, "NOT_FOUND", {
            detail: "Invalid app",
        });
    }

    next();
}
