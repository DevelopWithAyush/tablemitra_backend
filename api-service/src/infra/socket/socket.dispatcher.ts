import { io } from "./socket.server.js";
import { Rooms } from "./socket.rooms.js";

/**
 * Socket emit strategy for food orders:
 * - Order CREATED → emit to hotel (hotel:hotelId) so kitchen/dashboard sees new order in queue.
 * - Order ACCEPTED / status updates (preparing, ready, served, rejected, etc.) → emit to room
 *   (room:roomSessionId) so guest and staff viewing that room get live status.
 */
export const SocketDispatcher = { 
  emitToChain: (chainId: string, event: string, payload: any) => {
    io.to(Rooms.chain(chainId)).emit(event, payload)
  },

  emitToHotel: (hotelId: string, event: string, payload: any) => {
    io.to(Rooms.hotel(hotelId)).emit(event, payload)
  },

  emitToRoom: (roomId: string, event: string, payload: any) => {
    io.to(Rooms.room(roomId)).emit(event, payload)
  },

  emitToUser: (userId: string, event: string, payload: any) => {
    io.to(Rooms.user(userId)).emit(event, payload)
  },
}