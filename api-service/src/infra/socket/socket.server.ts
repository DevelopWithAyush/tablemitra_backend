import cookie from "cookie";
import { Server } from "socket.io";
import http from "http";
import { socketAuthMiddleware } from "./socket.auth.js";
import { Rooms, getDepartmentFromApp } from "./socket.rooms.js";
import { onDepartmentConnected, onDepartmentDisconnecting } from "./presence.service.js";
import logger from "../../helpers/logger/index.js";

export let io: Server;

const CORS_ORIGINS = [
    process.env.CUSTOMER_LOGIN_URL,
    process.env.MANAGER_APP_URL,
    process.env.FRONTDESK_APP_URL,
    process.env.KITCHEN_APP_URL,
    process.env.ROOM_SERVICE_APP_URL,
].filter((url): url is string => Boolean(url));

export const initSocket = (server: http.Server): void => {
    io = new Server(server, {
        cors: {
            origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : true,
            credentials: true,
        },
    });

    io.use(socketAuthMiddleware);

    io.on("connection", async (socket) => {
        const user = socket.data.user;
        if (!user) {
            socket.disconnect(true);
            return;
        }

        const userId: string = user.sub;
        const app: string = user.app ?? "";
        const hotelId: string | undefined = user.ctx?.type === "HOTEL" ? user.ctx.id : undefined;

        // ── Personal room (DMs / targeted events) ──────────────────────────
        socket.join(Rooms.user(userId));

        // ── Hotel staff ─────────────────────────────────────────────────────
        if (hotelId) {
            // Every hotel staff member joins the hotel-wide broadcast room
            socket.join(Rooms.hotel(hotelId));

            // Department staff additionally join their role-specific room
            const dept = getDepartmentFromApp(app);
            if (dept) {
                socket.join(Rooms.hotelDepartment(hotelId, dept));
                // Must be called AFTER join so the room size already includes this socket
                await onDepartmentConnected(hotelId, dept);
            }
        }

        // ── Guest with active room session ──────────────────────────────────
        const cookieHeader = socket.handshake.headers.cookie;
        if (typeof cookieHeader === "string" && app === "customer") {
            const parsed = cookie.parse(cookieHeader);
            const guestHotelId = parsed.customer_room_hotel_id;
            const roomSessionId = parsed.customer_room_session_id;
            if (guestHotelId) socket.join(Rooms.hotel(guestHotelId));
            if (roomSessionId) socket.join(Rooms.room(roomSessionId));
        }

        logger.info(`[Socket] Connected  — id: ${socket.id} | userId: ${userId} | app: ${app}`);

        // ── Presence: track when department panel goes offline ──────────────
        // `disconnecting` fires before the socket leaves its rooms, so room sizes are still accurate
        socket.on("disconnecting", async () => {
            if (hotelId) {
                const dept = getDepartmentFromApp(app);
                if (dept) {
                    await onDepartmentDisconnecting(hotelId, dept);
                }
            }
        });

        socket.on("disconnect", (reason) => {
            logger.info(`[Socket] Disconnected — id: ${socket.id} | reason: ${reason}`);
        });
    });
};
