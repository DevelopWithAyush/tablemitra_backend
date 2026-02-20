import moment from "moment-timezone";
import type { IAvailability } from "./menu.types.js";

/**
 * Convert "HH:mm" string to minutes since midnight.
 */
export function convertToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Determine if an item is available at the current time in the given timezone.
 * - No availability (no days/times) => always available.
 * - Otherwise: current day must be in availability.days, and current time in [startTime, endTime].
 * - Overnight: startMinutes > endMinutes => available if current >= start OR current <= end.
 */
export function isItemAvailable(
    availability: IAvailability | undefined | null,
    hotelTimezone: string
): boolean {
    if (!availability) {
        return true;
    }
    const { days, startTime, endTime } = availability;
    const now = moment().tz(hotelTimezone);
    const currentDay = now.day(); // 0 = Sunday, 6 = Saturday
    if (!days?.length || !days.includes(currentDay)) {
        return false;
    }
    if (!startTime || !endTime) {
        return true;
    }
    const startMinutes = convertToMinutes(startTime);
    const endMinutes = convertToMinutes(endTime);
    const currentMinutes = now.hours() * 60 + now.minutes();
    if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
    // Overnight window
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}
