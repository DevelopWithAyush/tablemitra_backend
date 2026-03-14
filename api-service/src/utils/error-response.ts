/**
 * RFC 7807/9457 error response helper.
 * Use for consistent error responses from controllers and middleware.
 */

import type { Response } from "express";
import type { ApiErrorResponse, ApiErrorType, FieldError } from "../types/error.types.js";
import { ERROR_TYPE_TITLES } from "../types/error.types.js";

export function sendErrorResponse(
    res: Response,
    status: number,
    type: ApiErrorType,
    options?: {
        title?: string;
        detail?: string;
        instance?: string;
        errors?: FieldError[];
    }
): Response {
    const response: ApiErrorResponse = {
        success: false,
        type,
        title: options?.title ?? ERROR_TYPE_TITLES[type],
        status,
        ...(options?.detail && { detail: options.detail }),
        ...(options?.instance && { instance: options.instance }),
        ...(options?.errors && options.errors.length > 0 && { errors: options.errors }),
    };
    return res.status(status).json(response);
}

/** Build RFC 7807 problem object (for middleware; does not send) */
export function buildProblemResponse(
    status: number,
    type: ApiErrorType,
    options?: {
        title?: string;
        detail?: string;
        instance?: string;
        errors?: FieldError[];
        stack?: string;
        details?: unknown;
    }
): ApiErrorResponse & { stack?: string; details?: unknown } {
    const response: ApiErrorResponse & { stack?: string; details?: unknown } = {
        success: false,
        type,
        title: options?.title ?? ERROR_TYPE_TITLES[type],
        status,
        ...(options?.detail && { detail: options.detail }),
        ...(options?.instance && { instance: options.instance }),
        ...(options?.errors && options.errors.length > 0 && { errors: options.errors }),
    };
    if (options?.stack) response.stack = options.stack;
    if (options?.details !== undefined) response.details = options.details;
    return response;
}

/** Send error from service result (controllers: status + detail from result.message) */
export function sendServiceError(
    res: Response,
    status: number,
    detail: string,
    options?: { instance?: string }
): Response {
    return sendErrorResponse(res, status, statusToErrorType(status), {
        detail,
        ...(options?.instance && { instance: options.instance }),
    });
}

/** Infer error type from HTTP status (for controller responses) */
export function statusToErrorType(status: number): ApiErrorType {
    switch (status) {
        case 400:
            return "BAD_REQUEST";
        case 401:
            return "UNAUTHORIZED";
        case 403:
            return "FORBIDDEN";
        case 404:
            return "NOT_FOUND";
        case 409:
            return "CONFLICT";
        default:
            return status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
    }
}
