import Hotel from "../../modules/hospitality/db/hotel.model.js";
import logger from "../../helpers/logger/index.js";
import { io } from "./socket.server.js";
import { Rooms, type HotelDepartment } from "./socket.rooms.js";
import { SOCKET_EVENTS } from "./socket.events.js";

// ── DB field driven by each department's real-time presence ──────────────────

const DEPARTMENT_FLAG: Partial<Record<HotelDepartment, string>> = {
    KITCHEN: "panelSettings.kitchenEnabled",
    ROOM_SERVICE: "panelSettings.roomServiceEnabled",
    // FRONT_DESK has no DB flag — it is always the final fallback
};

async function setPanelFlag(hotelId: string, dept: HotelDepartment, value: boolean): Promise<void> {
    const field = DEPARTMENT_FLAG[dept];
    if (!field) return;

    try {
        await Hotel.findByIdAndUpdate(hotelId, { [field]: value });
    } catch (err) {
        logger.error(`[Presence] Failed to set ${field}=${value} for hotel ${hotelId}:`, err);
    }
}

// ── Room-size helpers ────────────────────────────────────────────────────────

/** Returns the current size of a department socket room (0 if room doesn't exist). */
function roomSize(hotelId: string, dept: HotelDepartment): number {
    return io.sockets.adapter.rooms.get(Rooms.hotelDepartment(hotelId, dept))?.size ?? 0;
}

// ── Lifecycle hooks called from socket.server.ts ─────────────────────────────

/**
 * Call AFTER socket.join(departmentRoom).
 * If this is the first socket in the room → mark panel online in DB and broadcast PANEL_ONLINE.
 */
export async function onDepartmentConnected(hotelId: string, dept: HotelDepartment): Promise<void> {
    if (roomSize(hotelId, dept) !== 1) return; // not the first connection

    logger.info(`[Presence] ${dept} panel ONLINE for hotel ${hotelId}`);
    await setPanelFlag(hotelId, dept, true);

    io.to(Rooms.hotel(hotelId)).emit(SOCKET_EVENTS.PANEL_ONLINE, { department: dept, hotelId });
}

/**
 * Call inside the `disconnecting` event (before socket leaves rooms).
 * If this is the last socket in the room → mark panel offline in DB and broadcast PANEL_OFFLINE.
 */
export async function onDepartmentDisconnecting(hotelId: string, dept: HotelDepartment): Promise<void> {
    if (roomSize(hotelId, dept) !== 1) return; // others still connected

    logger.info(`[Presence] ${dept} panel OFFLINE for hotel ${hotelId}`);
    await setPanelFlag(hotelId, dept, false);

    // Emit to hotel-wide room so every active panel (manager, frontdesk…) is notified
    io.to(Rooms.hotel(hotelId)).emit(SOCKET_EVENTS.PANEL_OFFLINE, { department: dept, hotelId });
}
