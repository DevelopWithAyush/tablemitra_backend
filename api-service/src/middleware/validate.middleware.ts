import type { Request, Response, NextFunction } from "express";
import { z, type ZodTypeAny } from "zod";
import { ErrorHandler } from "./error.middleware.js";

export const validate =
    (schema: ZodTypeAny) =>
        (req: Request, res: Response, next: NextFunction) => {
            try {
                schema.parse({
                    body: req.body,
                    query: req.query,
                    params: req.params,
                    headers: req.headers,
                });
                next();
            } catch (error) {
                if (error instanceof z.ZodError) {
                    // Format Zod validation errors into a user-friendly message
                    const errors = error.issues.map((issue) => {
                        const path = issue.path.length > 0 ? issue.path.join(".") : "";
                        return `${path ? `${path}: ` : ""}${issue.message}`;
                    });
                    const message = errors.join(". ");

                    // Create ErrorHandler instance to pass to error middleware
                    const validationError = new ErrorHandler(message, 400);
                    validationError.name = "ZodValidationError";
                    next(validationError);
                } else {
                    // For any other errors, pass them to error middleware
                    next(error);
                }
            }
        };
