import type { Request, Response, NextFunction } from 'express';
import logger from '../helpers/logger/index.js';
import { buildProblemResponse } from '../utils/error-response.js';
import type { ApiErrorType, FieldError } from '../types/error.types.js';

interface MongooseDuplicateError extends Error {
    code: number;
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
}

interface MongooseCastError extends Error {
    name: 'CastError';
    path?: string;
    value?: unknown;
    kind?: string;
}

interface MongooseValidationError extends Error {
    name: 'ValidationError';
    errors?: Record<string, { message?: string; path?: string }>;
}

interface JwtError extends Error {
    name: 'JsonWebTokenError' | 'TokenExpiredError' | 'NotBeforeError';
    expiredAt?: Date;
}

interface ZodValidationError extends Error {
    name: 'ZodValidationError';
    validationErrors?: FieldError[];
}

interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
    code?: number;
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
    path?: string;
    value?: unknown;
    kind?: string;
    errors?: Record<string, { message?: string; path?: string }>;
    validationErrors?: FieldError[];
    expiredAt?: Date;
}

const isDevelopment = process.env.NODE_ENV !== 'production';

const handleMongooseDuplicateError = (err: MongooseDuplicateError): { detail: string; statusCode: number } => {
    const fields = err.keyPattern ? Object.keys(err.keyPattern) : [];
    const values = err.keyValue ? Object.values(err.keyValue) : [];
    const detail = `Duplicate value${fields.length > 1 ? 's' : ''} for field${fields.length > 1 ? 's' : ''}: ${fields.join(', ')}. Value${values.length > 1 ? 's' : ''}: ${values.join(', ')}`;
    return { detail, statusCode: 409 };
};

const handleMongooseCastError = (err: MongooseCastError): { detail: string; statusCode: number } => {
    const detail = `Invalid ${err.kind || 'format'} for field: ${err.path || 'unknown'}`;
    return { detail, statusCode: 400 };
};

const handleMongooseValidationError = (err: MongooseValidationError): { detail: string; statusCode: number; fieldErrors?: FieldError[] } => {
    const errs = err.errors ? Object.entries(err.errors) : [];
    const fieldErrors: FieldError[] = errs.map(([path, e]) => ({
        name: path,
        message: e?.message || `Invalid value for ${path}`,
    }));
    const detail = fieldErrors.length > 0
        ? fieldErrors.map((e) => `${e.name}: ${e.message}`).join('. ')
        : 'Validation failed';
    return { detail, statusCode: 400, fieldErrors };
};

const handleJwtError = (err: JwtError): { detail: string; statusCode: number } => {
    if (err.name === 'TokenExpiredError') {
        return { detail: 'Token has expired', statusCode: 401 };
    }
    if (err.name === 'NotBeforeError') {
        return { detail: 'Token not active yet', statusCode: 401 };
    }
    return { detail: 'Invalid token', statusCode: 401 };
};

/** Map legacy error codes to RFC 7807 types */
function statusToType(status: number, err: AppError): ApiErrorType {
    if ((err as ZodValidationError).validationErrors) return 'VALIDATION_ERROR';
    if (err.code === 11000) return 'CONFLICT';
    if (err.name === 'CastError') return 'BAD_REQUEST';
    if (err.name === 'ValidationError') return 'VALIDATION_ERROR';
    if (err.name === 'ZodValidationError') return 'VALIDATION_ERROR';
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
        return 'UNAUTHORIZED';
    }
    switch (status) {
        case 401: return 'UNAUTHORIZED';
        case 403: return 'FORBIDDEN';
        case 404: return 'NOT_FOUND';
        case 409: return 'CONFLICT';
        default: return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
    }
}

export const errorMiddleware = (
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
): Response => {
    let statusCode = err.statusCode || 500;
    let detail = err.message || 'Internal Server Error';
    let fieldErrors: FieldError[] | undefined;

    // Handle Mongoose duplicate key error
    if (err.code === 11000) {
        const result = handleMongooseDuplicateError(err as MongooseDuplicateError);
        detail = result.detail;
        statusCode = result.statusCode;
    }
    // Handle Mongoose cast error
    else if (err.name === 'CastError') {
        const result = handleMongooseCastError(err as MongooseCastError);
        detail = result.detail;
        statusCode = result.statusCode;
    }
    // Handle Mongoose validation error
    else if (err.name === 'ValidationError') {
        const result = handleMongooseValidationError(err as MongooseValidationError);
        detail = result.detail;
        statusCode = result.statusCode;
        fieldErrors = result.fieldErrors;
    }
    // Handle Zod validation error (structured errors from validate middleware)
    else if (err.name === 'ZodValidationError') {
        fieldErrors = (err as ZodValidationError).validationErrors;
        if (!fieldErrors?.length) {
            // Fallback if validate middleware didn't pass structured errors
            detail = err.message;
        }
        statusCode = 400;
    }
    // Handle JWT errors
    else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
        const result = handleJwtError(err as JwtError);
        detail = result.detail;
        statusCode = result.statusCode;
    }
    // Handle operational errors (ErrorHandler)
    else if (err.isOperational) {
        detail = err.message;
        // statusCode already set from err.statusCode
    }
    // Handle unknown errors
    else {
        if (!isDevelopment) {
            detail = 'Something went wrong. Please try again later.';
        }
    }

    const type = statusToType(statusCode, err);
    const instance = req.originalUrl || req.path;

    const errorLog = {
        message: err.message,
        statusCode,
        type,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString(),
        ...(isDevelopment && { stack: err.stack }),
    };

    logger.error('Error occurred:', errorLog);

    const problem = buildProblemResponse(statusCode, type, {
        detail,
        instance,
        errors: fieldErrors,
        ...(isDevelopment && {
            stack: err.stack,
            details: err,
        }),
    });

    // Omit dev-only fields from response in production
    const { stack, details, ...response } = problem;
    const body = isDevelopment ? problem : response;

    return res.status(statusCode).json(body);
};

class ErrorHandler extends Error {
    statusCode: number;
    isOperational: boolean;

    constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.name = 'ErrorHandler';

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export { ErrorHandler };
