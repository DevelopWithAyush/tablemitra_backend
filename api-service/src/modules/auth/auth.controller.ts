import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { buildCookieOptions } from "../../utils/cookies.js";
import { IJwtPayload, SendOtpDTO, VerifyOtpDTO } from "./auth.types.js";
import authService from "./auth.service.js";
import logger from "../../helpers/logger/index.js";

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

        if (!refreshTokenValue) {
            return res.status(401).json({
                success: false,
                message: "Refresh token not found",
            });
        }

        const result = await authService.refreshToken(refreshTokenValue, app);

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

        const result = await authService.logout(user.sub, user.roleId, app);

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
            app  
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
}

export default new AuthController();
