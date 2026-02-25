import cookie from "cookie";
import type { Socket } from "socket.io";
import { verifyAccessToken } from "../../utils/jwt.js";
import { IJwtPayload } from "../../modules/auth/auth.types.js";
import logger from "../../helpers/logger/index.js";

const COOKIE_ACCESS = "accessToken";

/**
 * Resolve access token from socket handshake (app-centric cookies: accessToken / refreshToken by subdomain).
 * Order: cookie "accessToken" (same as REST) → Authorization header → handshake.auth.token.
 */
function getTokenFromHandshake(socket: Socket): string | null {
    const headers = socket.handshake.headers;
    const auth = socket.handshake.auth as { token?: string };

    if (auth?.token && typeof auth.token === "string") {
        return auth.token;
    }
    const authHeader = headers.authorization;
    if (typeof authHeader === "string") {
        const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
        if (bearer) return bearer[1];
    }
    const cookieHeader = headers.cookie;
    if (typeof cookieHeader === "string") {
        const parsed = cookie.parse(cookieHeader);
        if (parsed[COOKIE_ACCESS]) return parsed[COOKIE_ACCESS];
    }
    return null;
}

/**
 * Socket.IO auth middleware: verify accessToken (cookie or header), attach user to socket.data.
 * Uses same cookie names as REST: accessToken (and app is inferred from JWT payload / cookie domain).
 */
export function socketAuthMiddleware(
    socket: Socket,
    next: (err?: Error) => void
): void {
    try {
        const token = getTokenFromHandshake(socket);
        if (!token) {
            logger.warn("[Socket] No access token in handshake");
            return next(new Error("Unauthorized"));
        }

        const decoded = verifyAccessToken(token) as IJwtPayload;
        socket.data.user = decoded;
        next();
    } catch {
        logger.warn("[Socket] Invalid or expired access token");
        next(new Error("Unauthorized"));
    }
}
