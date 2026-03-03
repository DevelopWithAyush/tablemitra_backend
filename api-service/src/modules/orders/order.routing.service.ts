import Hotel from "../hospitality/db/hotel.model.js";
import { Rooms, type HotelDepartment } from "../../infra/socket/socket.rooms.js";

/**
 * Resolves the target department room for a NEW FOOD ORDER alert.
 *
 * Priority chain:
 *   1. KITCHEN is online  →  hotel:{hotelId}:KITCHEN
 *   2. KITCHEN offline, kitchenOfflineRedirect = ROOM_SERVICE, ROOM_SERVICE is online
 *                         →  hotel:{hotelId}:ROOM_SERVICE
 *   3. Everything else    →  hotel:{hotelId}:FRONT_DESK
 *
 * "Online" is determined by the real-time `panelSettings` flags in the hotel document.
 * Those flags are kept in sync by presence.service.ts on every socket connect / disconnect.
 */
export async function resolveFoodOrderTargetRoom(hotelId: string): Promise<{
    department: HotelDepartment;
    room: string;
}> {
    const hotel = await Hotel.findById(hotelId)
        .select("panelSettings")
        .lean();

    if (!hotel) throw new Error(`Hotel not found: ${hotelId}`);

    const { kitchenEnabled, roomServiceEnabled, kitchenOfflineRedirect } =
        hotel.panelSettings as {
            kitchenEnabled: boolean;
            roomServiceEnabled: boolean;
            kitchenOfflineRedirect: "FRONTDESK" | "ROOM_SERVICE";
        };

    if (kitchenEnabled) {
        return { department: "KITCHEN", room: Rooms.hotelDepartment(hotelId, "KITCHEN") };
    }

    if (kitchenOfflineRedirect === "ROOM_SERVICE" && roomServiceEnabled) {
        return { department: "ROOM_SERVICE", room: Rooms.hotelDepartment(hotelId, "ROOM_SERVICE") };
    }

    return { department: "FRONT_DESK", room: Rooms.hotelDepartment(hotelId, "FRONT_DESK") };
}

/**
 * Resolves the target department room for a NEW SERVICE REQUEST alert (laundry, amenities, etc.).
 * Kitchen is never involved in service requests.
 *
 * Priority chain:
 *   1. ROOM_SERVICE is online  →  hotel:{hotelId}:ROOM_SERVICE
 *   2. ROOM_SERVICE offline    →  hotel:{hotelId}:FRONT_DESK
 */
export async function resolveServiceRequestTargetRoom(hotelId: string): Promise<{
    department: HotelDepartment;
    room: string;
}> {
    const hotel = await Hotel.findById(hotelId)
        .select("panelSettings.roomServiceEnabled")
        .lean();

    if (!hotel) throw new Error(`Hotel not found: ${hotelId}`);

    const { roomServiceEnabled } = hotel.panelSettings as { roomServiceEnabled: boolean };

    if (roomServiceEnabled) {
        return { department: "ROOM_SERVICE", room: Rooms.hotelDepartment(hotelId, "ROOM_SERVICE") };
    }

    return { department: "FRONT_DESK", room: Rooms.hotelDepartment(hotelId, "FRONT_DESK") };
}
