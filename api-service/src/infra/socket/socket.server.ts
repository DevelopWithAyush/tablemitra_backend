import cookie from "cookie";
import { Server } from "socket.io";
import http from "http";
import { socketAuthMiddleware } from "./socket.auth.js";
import { Rooms } from "./socket.rooms.js";
import logger from "../../helpers/logger/index.js";

export let io: Server;

const CORS_ORIGINS = [
    process.env.CUSTOMER_LOGIN_URL,
    process.env.MANAGER_APP_URL,
    process.env.FRONTDESK_APP_URL,
    process.env.KITCHEN_APP_URL,
    process.env.ROOM_SERVICE_APP_URL,
].filter((url): url is string => Boolean(url));

export const initSocket = (server: http.Server) => {
    io = new Server(server, {
        cors: {
            origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : true,
            credentials: true,
        },
    });

    io.use(socketAuthMiddleware);

    io.on("connection", (socket) => {
        const user = socket.data.user;
        if (!user) {
            socket.disconnect(true);
            return;
        }

        const userId = user.sub;
        socket.join(Rooms.user(userId));

        if (user.ctx?.type === "HOTEL" && user.ctx.id) {
            socket.join(Rooms.hotel(user.ctx.id));
        }

        const cookieHeader = socket.handshake.headers.cookie;
        if (typeof cookieHeader === "string" && user.app === "customer") {
            const parsed = cookie.parse(cookieHeader);
            const hotelId = parsed.customer_room_hotel_id;
            const roomSessionId = parsed.customer_room_session_id;
            if (hotelId) socket.join(Rooms.hotel(hotelId));
            if (roomSessionId) socket.join(Rooms.room(roomSessionId));
        }

        logger.info(`[Socket] Connected - socketId: ${socket.id}, userId: ${userId}, app: ${user.app}`);

        socket.on("disconnect", (reason) => {
            logger.info(`[Socket] Disconnected - socketId: ${socket.id}, reason: ${reason}`);
        });
    });
};
