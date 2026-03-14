/**
 * RFC 7807/9457 Problem Details for HTTP APIs.
 * Standardized error response format across the entire API.
 */

export type ApiErrorType =
    | "VALIDATION_ERROR"
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_ERROR";

export interface FieldError {
    /** Field path (e.g. "body.shortCode", "query.page") */
    name: string;
    /** User-facing message */
    message: string;
}

export interface ApiErrorResponse {
    success: false;
    /** Machine-readable error type (RFC 7807 type as short code) */
    type: ApiErrorType;
    /** Short, human-readable summary */
    title: string;
    /** HTTP status code */
    status: number;
    /** Specific explanation for this occurrence */
    detail?: string;
    /** Request path or trace ID */
    instance?: string;
    /** Field-level validation errors */
    errors?: FieldError[];
}

export const ERROR_TYPE_TITLES: Record<ApiErrorType, string> = {
    VALIDATION_ERROR: "Validation Failed",
    BAD_REQUEST: "Bad Request",
    UNAUTHORIZED: "Unauthorized",
    FORBIDDEN: "Forbidden",
    NOT_FOUND: "Not Found",
    CONFLICT: "Conflict",
    INTERNAL_ERROR: "Internal Server Error",
};
