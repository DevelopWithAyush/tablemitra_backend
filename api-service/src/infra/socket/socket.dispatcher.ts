import { io } from "./socket.server.js";
import { Rooms, type HotelDepartment } from "./socket.rooms.js";

export const SocketDispatcher = {
    /** Broadcast to an entire chain (chain:{chainId}). */
    emitToChain: (chainId: string, event: string, payload: unknown): void => {
        io.to(Rooms.chain(chainId)).emit(event, payload);
    },

    /** Broadcast to every socket in a hotel (hotel:{hotelId}) — managers, all staff, guests. */
    emitToHotel: (hotelId: string, event: string, payload: unknown): void => {
        io.to(Rooms.hotel(hotelId)).emit(event, payload);
    },

    /**
     * Emit to a specific department room (hotel:{hotelId}:KITCHEN | ROOM_SERVICE | FRONT_DESK).
     * Use this for new-order alerts that are routed to a single department.
     */
    emitToDepartment: (hotelId: string, dept: HotelDepartment, event: string, payload: unknown): void => {
        io.to(Rooms.hotelDepartment(hotelId, dept)).emit(event, payload);
    },

    /** Emit to a guest room session (room:{roomSessionId}) — status updates visible to guest. */
    emitToRoom: (roomId: string, event: string, payload: unknown): void => {
        io.to(Rooms.room(roomId)).emit(event, payload);
    },

    /** Emit directly to a single user (user:{userId}). */
    emitToUser: (userId: string, event: string, payload: unknown): void => {
        io.to(Rooms.user(userId)).emit(event, payload);
    },
};