import moment from "moment-timezone";
import type { IAvailability } from "./service.types.js";

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Convert "HH:mm" (24h) to "h:mm am/pm" for API response (e.g. "09:00" -> "9:00 am", "18:00" -> "6:00 pm").
 */
export function formatTime12h(time: string): string {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr ?? "0", 10);
    const m = parseInt(mStr ?? "0", 10);
    const period = h < 12 ? "am" : "pm";
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const min = m.toString().padStart(2, "0");
    return `${hour12}:${min} ${period}`;
}

/**
 * Format availability from DB shape for API response: days as ["sun","mon",...], times as "9:00 am" / "6:00 pm".
 */
export function formatAvailabilityForResponse(av: IAvailability | undefined | null): {
    days: string[];
    startTime?: string;
    endTime?: string;
} {
    if (!av) return { days: [] };
    const days = (av.days ?? []).map((d) => DAY_NAMES[d] ?? String(d));
    return {
        days,
        startTime: av.startTime ? formatTime12h(av.startTime) : undefined,
        endTime: av.endTime ? formatTime12h(av.endTime) : undefined,
    };
}

/**
 * Convert "HH:mm" string to minutes since midnight.
 */
export function convertToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Determine if a service/item is available at the current time in the given timezone.
 * - No availability (no days/times) => always available.
 * - Otherwise: current day must be in availability.days, and current time in [startTime, endTime].
 * - Overnight: startMinutes > endMinutes => available if current >= start OR current <= end.
 */
export function isServiceAvailable(
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
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}
