/** Department rooms within a hotel. Naming must stay stable — used for presence tracking. */
export type HotelDepartment = "KITCHEN" | "ROOM_SERVICE" | "FRONT_DESK";

/** Maps JWT `app` values to their hotel department room. */
const APP_TO_DEPARTMENT: Record<string, HotelDepartment> = {
    kitchen: "KITCHEN",
    "room-service": "ROOM_SERVICE",
    frontdesk: "FRONT_DESK",
};

/**
 * Returns the HotelDepartment for a given JWT `app` string.
 * Returns null for apps that do not own a department room (e.g. manager, admin).
 */
export function getDepartmentFromApp(app: string): HotelDepartment | null {
    return APP_TO_DEPARTMENT[app] ?? null;
}

export const Rooms = {
    chain: (chainId: string) => `chain:${chainId}`,
    /** Staff-only broadcast room (manager, kitchen, frontdesk, room-service). */
    hotel: (hotelId: string) => `hotel:${hotelId}`,
    /** Role-specific department room: hotel:{hotelId}:KITCHEN | ROOM_SERVICE | FRONT_DESK */
    hotelDepartment: (hotelId: string, dept: HotelDepartment) => `hotel:${hotelId}:${dept}`,
    /**
     * Guest-only broadcast room for a hotel.
     * All active customers of hotel:{hotelId} join this room.
     * Use for guest-safe events: menu item availability, hotel announcements, etc.
     * Staff events must NEVER be emitted here.
     */
    hotelGuest: (hotelId: string) => `hotel:${hotelId}:GUEST`,
    /** Individual room session — for order status updates to guests of that room. */
    room: (roomId: string) => `room:${roomId}`,
    user: (userId: string) => `user:${userId}`,
};