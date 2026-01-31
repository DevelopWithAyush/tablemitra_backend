import { NextFunction, Request, Response } from "express";
import { z } from "zod";

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
        return res.status(404).json({
            error: "Invalid app"
        });
    }

    next();
}
