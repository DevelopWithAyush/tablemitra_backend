import type { Request, Response, NextFunction } from 'express';
import logger from '../helpers/logger/index.js';

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
    expiredAt?: Date;
}

interface ErrorResponse {
    success: false;
    message: string;
    errorCode?: string;
    stack?: string;
    details?: unknown;
}

const isDevelopment = process.env.NODE_ENV !== 'production';

const handleMongooseDuplicateError = (err: MongooseDuplicateError): { message: string; statusCode: number } => {
    const fields = err.keyPattern ? Object.keys(err.keyPattern) : [];
    const values = err.keyValue ? Object.values(err.keyValue) : [];
    const message = `Duplicate value${fields.length > 1 ? 's' : ''} for field${fields.length > 1 ? 's' : ''}: ${fields.join(', ')}. Value${values.length > 1 ? 's' : ''}: ${values.join(', ')}`;
    return { message, statusCode: 409 };
};

const handleMongooseCastError = (err: MongooseCastError): { message: string; statusCode: number } => {
    const message = `Invalid ${err.kind || 'format'} for field: ${err.path || 'unknown'}`;
    return { message, statusCode: 400 };
};

const handleMongooseValidationError = (err: MongooseValidationError): { message: string; statusCode: number } => {
    const errors = err.errors ? Object.values(err.errors) : [];
    const messages = errors
        .map((error) => error.message || `Invalid value for ${error.path || 'field'}`)
        .filter(Boolean);
    const message = messages.length > 0 ? messages.join('. ') : 'Validation failed';
    return { message, statusCode: 400 };
};

const handleJwtError = (err: JwtError): { message: string; statusCode: number } => {
    if (err.name === 'TokenExpiredError') {
        return { message: 'Token has expired', statusCode: 401 };
    }
    if (err.name === 'NotBeforeError') {
        return { message: 'Token not active yet', statusCode: 401 };
    }
    return { message: 'Invalid token', statusCode: 401 };
};

export const errorMiddleware = (
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
): Response => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let errorCode: string | undefined;

    // Handle Mongoose duplicate key error
    if (err.code === 11000) {
        const result = handleMongooseDuplicateError(err as MongooseDuplicateError);
        message = result.message;
        statusCode = result.statusCode;
        errorCode = 'DUPLICATE_KEY_ERROR';
    }
    // Handle Mongoose cast error
    else if (err.name === 'CastError') {
        const result = handleMongooseCastError(err as MongooseCastError);
        message = result.message;
        statusCode = result.statusCode;
        errorCode = 'INVALID_ID_FORMAT';
    }
    // Handle Mongoose validation error
    else if (err.name === 'ValidationError') {
        const result = handleMongooseValidationError(err as MongooseValidationError);
        message = result.message;
        statusCode = result.statusCode;
        errorCode = 'VALIDATION_ERROR';
    }
    // Handle Zod validation error
    else if (err.name === 'ZodValidationError') {
        errorCode = 'VALIDATION_ERROR';
        // Message is already formatted by validate middleware
    }
    // Handle JWT errors
    else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
        const result = handleJwtError(err as JwtError);
        message = result.message;
        statusCode = result.statusCode;
        errorCode = 'JWT_ERROR';
    }
    // Handle operational errors (known errors)
    else if (err.isOperational) {
        errorCode = 'OPERATIONAL_ERROR';
    }
    // Handle unknown errors
    else {
        errorCode = 'INTERNAL_SERVER_ERROR';
        // Don't expose internal error details in production
        if (!isDevelopment) {
            message = 'Something went wrong. Please try again later.';
        }
    }

    // Log error with context
    const errorLog = {
        message: err.message,
        statusCode,
        errorCode,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString(),
        ...(isDevelopment && { stack: err.stack }),
    };

    // Use console.error for now (can be replaced with proper logger like winston/pino)
    logger.error('Error occurred:', errorLog);

    // Build error response
    const errorResponse: ErrorResponse = {
        success: false,
        message,
        ...(errorCode && { errorCode }),
    };

    if (isDevelopment) {
        if (err.stack) {
            errorResponse.stack = err.stack;
        }
        errorResponse.details = err;
    }

    return res.status(statusCode).json(errorResponse);
};

class ErrorHandler extends Error {
    statusCode: number;
    isOperational: boolean;

    constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.name = 'ErrorHandler';

        // Maintains proper stack trace for where error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export { ErrorHandler };
