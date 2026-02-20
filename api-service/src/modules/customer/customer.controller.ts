import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { verifyAccessToken } from "../../utils/jwt.js";
import { IJwtPayload } from "../auth/auth.types.js";
import authService from "../auth/auth.service.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import { qrCodeService } from "../qr-code/qr-code.service.js";
import logger from "../../helpers/logger/index.js";
/** Session cookies: no maxAge/expires so they are cleared when the user closes the browser. */
const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: "none" as const };

/**
 * Customer scan flow (ROOM only). GET /api/v1/customer/scan/:code
 * - Resolve QR → hotelId, roomNumber. If not ROOM or not found → redirect to error.
 * - If customer not logged in: create scanToken, redirect to login with ?scanToken=xxx.
 * - If logged in: attach customer to room session, set room context cookies, redirect to app.
 */
export const handleCustomerScan = asyncHandler(async (req: Request, res: Response) => {
    const app = req.params.app as string;
    const code = req.params.code as string;

    if (app !== "customer") {
        return res.status(404).json({ success: false, message: "Not found" });
    }

    const qrResult = await qrCodeService.getQrCodeByCode(code);
    if (!qrResult.success || !qrResult.data) {
        const loginUrl = process.env.CUSTOMER_LOGIN_URL 
        return res.redirect(302, `${loginUrl}?error=invalid_qr`);
    }

    const data = qrResult.data;
    if (data.type !== "ROOM") {
        const loginUrl = process.env.CUSTOMER_LOGIN_URL;
        return res.redirect(302, `${loginUrl}?error=room_only`);
    }

    const hotelId = data.hotelId;
    const roomNumber = data.roomNumber ?? "";
    if (!roomNumber) {
        const loginUrl = process.env.CUSTOMER_LOGIN_URL;
        return res.redirect(302, `${loginUrl}?error=invalid_room`);
    }

    const loginUrl = process.env.CUSTOMER_LOGIN_URL  
    logger.info(`loginUrl: ${loginUrl}`);
    const appUrl = process.env.CUSTOMER_APP_URL 
    logger.info(`appUrl: ${appUrl}`);
    if (!loginUrl || !appUrl) {
        return res.status(500).json({ success: false, message: "CUSTOMER_LOGIN_URL or CUSTOMER_APP_URL is not set" });
    }

    let userId: string | null = null;
    const token = req.cookies["accessToken_customer"] ?? req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (token) {
        try {
            const decoded = verifyAccessToken(token) as IJwtPayload;
            if (decoded.app === "customer") userId = decoded.sub;
        } catch {
            // ignore invalid token
        }
    }

    if (!userId) {
        const scanToken = await authService.createScanToken({ hotelId, roomNumber });
        return res.redirect(302, `${loginUrl}?scanToken=${scanToken}`);
    }

    const roomResult = await hospitalityService.attachCustomerToRoomSession(hotelId, roomNumber, userId);
    if (!roomResult.success || !roomResult.data) {
        return res.redirect(302, `${appUrl}?error=room_attach_failed`);
    }

    res.cookie("customer_room_hotel_id", roomResult.data.hotelId, COOKIE_OPTS);
    res.cookie("customer_room_room_number", roomResult.data.roomNumber, COOKIE_OPTS);
    res.cookie("customer_room_session_id", roomResult.data.roomSessionId, COOKIE_OPTS);

    return res.redirect(302, appUrl);
});
