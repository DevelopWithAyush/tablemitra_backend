import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import logger from "../helpers/logger/index.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ErrorHandler } from "./error.middleware.js";
import { IJwtPayload } from "../modules/auth/auth.types.js";

export const authMiddleware = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const app = req.params.app;
    if (!app) {
        return next(new ErrorHandler("route not found", 404));
    }

    const cookieName = `accessToken_${app}`;
    const token = req.headers.authorization?.split(" ")[1] || req.cookies[cookieName];

    logger.info(`token: ${token ? "present" : "missing"}`);

    if (!token) {
        return next(new ErrorHandler("Unauthorized", 401));
    }

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string);
        (req as any).user = decoded as IJwtPayload;
        return next();

    } catch (err) {
        logger.warn("Invalid JWT detected. Clearing auth cookie.");

        res.clearCookie(cookieName, {
            httpOnly: true,
            secure: true,
            sameSite: "none"
        }); 
        res.clearCookie(`refreshToken_${app}`, {
            httpOnly: true,
            secure: true,
            sameSite:"none"
        })

        return next(new ErrorHandler("Unauthorized", 401));
    }
});
