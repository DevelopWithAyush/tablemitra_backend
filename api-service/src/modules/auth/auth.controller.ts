import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { IJwtPayload, SendOtpDTO, VerifyOtpDTO } from "./auth.types.js";
import authService from "./auth.service.js";
import logger from "../../helpers/logger/index.js";
import { publishAuditEvent } from "../audit/audit.publisher.js";
import type { ActorRole } from "../audit/audit.types.js";
import { UpdateCustomerProfileSchema } from "./validator/auth.validator.js";

class AuthController {
    sendOtp = asyncHandler(async (req: Request, res: Response) => {
        const app = req.params.app as string;
        logger.info(`app: ${app}`);
        const body = req.body as SendOtpDTO["body"];
        const dto: SendOtpDTO = { body, app };

        const result = await authService.sendOtp(dto);

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: result.message,
            });
        }

        return res.status(400).json({
            success: false,
            message: result.message,
        });
    });

    verifyOtp = asyncHandler(async (req: Request, res: Response) => {
        const params = req.params as VerifyOtpDTO["params"];
        const body = req.body as VerifyOtpDTO["body"];
        const dto: VerifyOtpDTO = { body, params };
        const { app } = params;

        const result = await authService.verifyOtp(dto);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        const { accessToken, refreshToken } = result;
        const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
        const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

        res.cookie(`refreshToken_${app}`, refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: REFRESH_TOKEN_MAX_AGE,
        });
        res.cookie(`accessToken_${app}`, accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: ACCESS_TOKEN_MAX_AGE,
        });

        if (app === "customer" && result.roomContext) {
            // Session cookies: no maxAge so they expire when the user closes the browser
            const roomCookieOpts = { httpOnly: true, secure: true, sameSite: "none" as const };
            res.cookie("customer_room_hotel_id", result.roomContext.hotelId, roomCookieOpts);
            res.cookie("customer_room_room_number", result.roomContext.roomNumber, roomCookieOpts);
            res.cookie("customer_room_session_id", result.roomContext.roomSessionId, roomCookieOpts);
        }

        publishAuditEvent(
            "USER_LOGIN",
            "USER",
            result.userId,
            { userId: result.userId, role: result.roleKey as ActorRole },
            { context: { panel: app, ip: req.ip, userAgent: req.get("User-Agent") } }
        ).catch((err) => logger.error("Audit publish failed:", err));

        return res.status(200).json({
            success: true,
            message: "OTP verified successfully",
            data: { accessToken },
        });
    });

    refreshToken = asyncHandler(async (req: Request, res: Response) => {
        const { app } = req.params;

        // Get refresh token from cookie
        const refreshTokenValue = req.cookies[`refreshToken_${app}`];
        logger.info(`refreshTokenValue: ${refreshTokenValue}`);

        if (!refreshTokenValue) {
            return res.status(401).json({
                success: false,
                message: "Refresh token not found",
            });
        }

        const result = await authService.refreshToken(refreshTokenValue as string, app as string);

        if (!result.success) {
            // Clear cookies on failure
            res.clearCookie(`accessToken_${app}`, {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                maxAge: 0,
            });
            res.clearCookie(`refreshToken_${app}`, {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                maxAge: 0,
            });

            return res.status(401).json({
                success: false,
                message: result.message,
            });
        }

        const ACCESS_TOKEN_MAX_AGE = 24 * 60 * 1000 * 60; // 24 hours

        // Set new access token cookie
        res.cookie(`accessToken_${app}`, result.accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: ACCESS_TOKEN_MAX_AGE,
        });

        return res.status(200).json({
            success: true,
            message: "Token refreshed successfully",
            data: { accessToken: result.accessToken },
        });
    });



    getMe = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const app = req.params.app as string;

        const result = await authService.getMe(user, app);

        if (!result.success) {
            const statusCode = result.unauthorized ? 401 : 404;
            return res.status(statusCode).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            data: result.profile,
        });
    });

    logout = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const { app } = req.params;

        const result = await authService.logout(user.sub, user.roleId, app as string);

        if (!result.success) {
            const statusCode = result.unauthorized ? 401 : 400;
            return res.status(statusCode).json({
                success: false,
                message: result.message,
            });
        }

        res.clearCookie(`accessToken_${app}`,
            {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                maxAge: 0,
            }
        );
        res.clearCookie(`refreshToken_${app}`, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 0,
        });

        publishAuditEvent(
            "USER_LOGOUT",
            "USER",
            user.sub,
            { userId: user.sub, role: user.roleId as ActorRole },
            { context: { panel: app as string, ip: req.ip, userAgent: req.get("User-Agent") } }
        ).catch((err) => logger.error("Audit publish failed:", err));

        return res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    });

    /**
     * Get all chains available to a founder (for context switcher)
     */
    getChains = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const { app } = req.params;

        if (app !== "founder") {
            return res.status(400).json({
                success: false,
                message: "This endpoint is only available for founders",
            });
        }

        const result = await authService.getFounderChains(user.sub);

        if (!result.success) {
            return res.status(404).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            data: result,
        });
    });

    /**
     * Switch chain context for founder (mini re-login)
     */
    switchChain = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const { app } = req.params;
        const { chainId } = req.body as { chainId: string };

        if (!chainId) {
            return res.status(400).json({
                success: false,
                message: "chainId is required",
            });
        }

        const result = await authService.switchChainContext(
            user.sub,
            user.roleId,
            chainId,
            app as string
        );

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        const { accessToken, refreshToken } = result;
        const ACCESS_TOKEN_MAX_AGE = 24 * 60 * 1000 * 60; // 24 hours
        const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

        res.cookie(`refreshToken_${app}`, refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: REFRESH_TOKEN_MAX_AGE,
        });
        res.cookie(`accessToken_${app}`, accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: ACCESS_TOKEN_MAX_AGE,
        });

        return res.status(200).json({
            success: true,
            message: "Chain context switched successfully",
            data: { accessToken },
        });
    });

    /**
     * Update customer profile (name, email, foodPreferences, profilePicture). Only for app=customer.
     */
    updateCustomerProfile = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const app = req.params.app as string;

        if (app !== "customer") {
            return res.status(400).json({
                success: false,
                message: "This endpoint is only available for customers",
            });
        }

        const { body: dto } = UpdateCustomerProfileSchema.parse({ body: req.body });

        const result = await authService.updateCustomerProfile(user.sub, {
            name: dto.name,
            email: dto.email,
            foodPreferences: dto.foodPreferences,
            profilePicture: dto.profilePicture,
        });

        if (!result.success) {
            return res.status(404).json({
                success: false,
                message: result.message ?? "Customer profile not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: result.profile,
        });
    });
}

export default new AuthController();
