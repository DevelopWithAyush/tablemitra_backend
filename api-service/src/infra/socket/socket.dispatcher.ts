import { io } from "./socket.server.js";
import { Rooms, type HotelDepartment } from "./socket.rooms.js";

export const SocketDispatcher = {
    /** Broadcast to an entire chain (chain:{chainId}). */
    emitToChain: (chainId: string, event: string, payload: unknown): void => {
        io.to(Rooms.chain(chainId)).emit(event, payload);
    },

    /**
     * Broadcast to all hotel STAFF (hotel:{hotelId}).
     * Joined by: manager, kitchen, frontdesk, room-service.
     * DO NOT use for guest-facing events.
     */
    emitToHotel: (hotelId: string, event: string, payload: unknown): void => {
        io.to(Rooms.hotel(hotelId)).emit(event, payload);
    },

    /**
     * Broadcast to all active GUESTS of a hotel (hotel:{hotelId}:GUEST).
     * Use for guest-safe events: menu item availability changes, hotel announcements, etc.
     * Staff events must NEVER be emitted here.
     */
    emitToHotelGuests: (hotelId: string, event: string, payload: unknown): void => {
        io.to(Rooms.hotelGuest(hotelId)).emit(event, payload);
    },

    /**
     * Emit to a specific department room (hotel:{hotelId}:KITCHEN | ROOM_SERVICE | FRONT_DESK).
     * Use for new-order alerts routed to a single active department.
     */
    emitToDepartment: (hotelId: string, dept: HotelDepartment, event: string, payload: unknown): void => {
        io.to(Rooms.hotelDepartment(hotelId, dept)).emit(event, payload);
    },

    /**
     * Emit to a specific room session (room:{roomSessionId}).
     * Use for order status updates — reaches all guests in that room.
     */
    emitToRoom: (roomId: string, event: string, payload: unknown): void => {
        io.to(Rooms.room(roomId)).emit(event, payload);
    },

    /** Emit directly to a single user (user:{userId}). */
    emitToUser: (userId: string, event: string, payload: unknown): void => {
        io.to(Rooms.user(userId)).emit(event, payload);
    },
};