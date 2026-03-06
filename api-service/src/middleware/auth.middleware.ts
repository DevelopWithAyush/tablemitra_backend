import { createHash } from "crypto";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import logger from "../helpers/logger/index.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ErrorHandler } from "./error.middleware.js";
import { IJwtPayload } from "../modules/auth/auth.types.js";
import { getRedis } from "../infra/redis/redis.js";
import { buildCookieOptions } from "../utils/cookies.js";

export const authMiddleware = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const app = req.params.app;
    if (!app) {
        return next(new ErrorHandler("route not found", 404));
    }

    const cookieName = `accessToken`;
    const token = req.headers.authorization?.split(" ")[1] || req.cookies[cookieName];

    logger.info(`token: ${token ? "present" : "missing"}`);

    if (!token) {
        return next(new ErrorHandler("Unauthorized", 401));
    }

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string);

        // Reject tokens that were explicitly invalidated at logout
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const isBlocklisted = await getRedis().get(`blocklist:at:${tokenHash}`);
        if (isBlocklisted) {
            logger.warn("Blocklisted access token used. Rejecting.");
            res.clearCookie("accessToken", buildCookieOptions(app as string, 0));
            return next(new ErrorHandler("Unauthorized", 401));
        }

        (req as any).user = decoded as IJwtPayload;
        return next();

    } catch (err) {
        logger.warn("Invalid JWT detected. Clearing auth cookie.");

        res.clearCookie(cookieName, buildCookieOptions(app as string, 0));
        res.clearCookie("refreshToken", buildCookieOptions(app as string, 0));

        return next(new ErrorHandler("Unauthorized", 401));
    }
});
