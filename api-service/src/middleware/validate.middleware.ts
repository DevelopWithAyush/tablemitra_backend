import type { Request, Response, NextFunction } from "express";
import { z, type ZodTypeAny } from "zod";
import { ErrorHandler } from "./error.middleware.js";
import type { FieldError } from "../types/error.types.js";

/** Attach structured validation errors to ErrorHandler (for error middleware) */
declare module "./error.middleware.js" {
    interface ErrorHandler {
        validationErrors?: FieldError[];
    }
}

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
                    const errors: FieldError[] = error.issues.map((issue) => ({
                        name: issue.path.length > 0 ? issue.path.join(".") : "unknown",
                        message: issue.message,
                    }));
                    const validationError = new ErrorHandler(
                        errors.length > 0 ? errors.map((e) => `${e.name}: ${e.message}`).join(". ") : "Validation failed",
                        400
                    );
                    validationError.name = "ZodValidationError";
                    (validationError as ErrorHandler & { validationErrors?: FieldError[] }).validationErrors = errors;
                    next(validationError);
                } else {
                    next(error);
                }
            }
        };
