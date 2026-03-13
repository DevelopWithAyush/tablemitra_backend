import { Types } from "mongoose";
import CheckoutSessionModel from "./db/checkout-session.model.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import { publishCheckoutEvent } from "./checkout.analytics.publisher.js";
import { foodOrderService } from "../orders/food-order.service.js";
import { serviceRequestService } from "../orders/service-request.service.js";
import type { CheckoutPreview, CheckoutAdjustmentInput, ProceedCheckoutInput } from "./checkout.types.js";
import { roundTo2 } from "../orders/bill.util.js";

function computeAdjustmentsTotal(adjustments: CheckoutAdjustmentInput[]): number {
    let total = 0;
    for (const a of adjustments) {
        if (a.type === "DISCOUNT") {
            total -= Math.abs(a.amount);
        } else {
            total += Math.abs(a.amount);
        }
    }
    return roundTo2(total);
}

export const checkoutService = {
    /**
     * Get checkout preview for a room. Uses stored bill values – no recalculation.
     * DDD: uses hospitalityService and orders services only.
     * Accepts roomSessionId directly (e.g. from QR codes API when room is OCCUPIED).
     */
    getCheckoutPreview: async (
        roomSessionId: string
    ): Promise<{ success: boolean; message?: string; data?: CheckoutPreview }> => {
        const sessionResult = await hospitalityService.getRoomSessionById(roomSessionId);
        if (!sessionResult.success || !sessionResult.data) {
            return { success: false, message: sessionResult.message ?? "Room session not found" };
        }
        if (sessionResult.data.status !== "ACTIVE") {
            return { success: false, message: "Room is not active (already checked out)" };
        }

        const { hotelId, roomNumber } = sessionResult.data;
        const [foodOrders, serviceRequests, roomSession] = await Promise.all([
            foodOrderService.getPendingFoodOrdersByRoomSessionId(roomSessionId),
            serviceRequestService.getPendingServiceRequestsByRoomSessionId(roomSessionId),
            hospitalityService.getRoomSessionById(roomSessionId),
        ]);

        const foodOrdersMapped = foodOrders.map((o) => ({
            _id: o._id,
            items: o.items,
            bill: o.bill,
            count: o.count,
            createdAt: o.createdAt,
        }));
        const serviceRequestsMapped = serviceRequests.map((r) => ({
            _id: r._id,
            items: r.items,
            totalAmount: r.totalAmount,
            bill: r.bill,
            createdAt: r.createdAt,
        }));
        const ordersSubtotal = roundTo2(
            foodOrders.reduce((s, o) => s + (o.bill?.toPay ?? 0), 0) +
                serviceRequests.reduce((s, r) => s + (r.bill?.toPay ?? r.totalAmount ?? 0), 0)
        );

        const guestDetails =
            roomSession.success && roomSession.data?.metadata?.guests
                ? (roomSession.data.metadata.guests as Array<{ name?: string; phone?: string }>).map((g) => ({
                      name: g.name,
                      phone: g.phone,
                  }))
                : undefined;

        return {
            success: true,
            data: {
                roomSessionId,
                roomNumber,
                hotelId,
                foodOrders: foodOrdersMapped as CheckoutPreview["foodOrders"],
                serviceRequests: serviceRequestsMapped as CheckoutPreview["serviceRequests"],
                ordersSubtotal,
                guestDetails,
            },
        };
    },

    /**
     * Proceed checkout: apply adjustments, record payment method, mark orders paid, check out room.
     * No payment gateway – front desk processes offline.
     */
    proceedCheckout: async (
        input: ProceedCheckoutInput,
        checkedOutByUserId: string
    ): Promise<{
        success: boolean;
        message?: string;
        data?: {
            checkoutSessionId: string;
            finalAmount: number;
            roomNumber: string;
            hotelId: string;
        };
    }> => {
        const sessionResult = await hospitalityService.getActiveRoomSessionForOrder(
            input.hotelId,
            input.roomNumber.trim()
        );
        if (!sessionResult.success || !sessionResult.data) {
            return { success: false, message: sessionResult.message ?? "No active room session for this room" };
        }

        const { roomSessionId } = sessionResult.data;
        const [foodOrders, serviceRequests] = await Promise.all([
            foodOrderService.getPendingFoodOrdersByRoomSessionId(roomSessionId),
            serviceRequestService.getPendingServiceRequestsByRoomSessionId(roomSessionId),
        ]);

        let ordersSubtotal = 0;
        for (const o of foodOrders) {
            ordersSubtotal = roundTo2(ordersSubtotal + (o.bill?.toPay ?? 0));
        }
        for (const r of serviceRequests) {
            ordersSubtotal = roundTo2(ordersSubtotal + (r.bill?.toPay ?? r.totalAmount ?? 0));
        }

        const adjustmentsTotal = computeAdjustmentsTotal(input.adjustments);
        const finalAmount = roundTo2(Math.max(0, ordersSubtotal + adjustmentsTotal));

        const [checkoutSession] = await CheckoutSessionModel.create([
            {
                hotelId: new Types.ObjectId(input.hotelId),
                roomSessionId: new Types.ObjectId(roomSessionId),
                roomNumber: sessionResult.data.roomNumber,
                foodOrderIds: foodOrders.map((o) => o._id),
                serviceRequestIds: serviceRequests.map((r) => r._id),
                ordersSubtotal,
                adjustmentsTotal,
                adjustments: input.adjustments.map((a) => ({
                    type: a.type,
                    amount: a.amount,
                    label: a.label ?? null,
                })),
                finalAmount,
                paymentMethod: input.paymentMethod,
                checkedOutBy: new Types.ObjectId(checkedOutByUserId),
                guestDetails: input.guestDetails
                    ? { name: input.guestDetails.name ?? null, phone: input.guestDetails.phone ?? null }
                    : undefined,
            },
        ]);

        await Promise.all([
            foodOrderService.markFoodOrdersPaid(foodOrders.map((o) => o._id)),
            serviceRequestService.markServiceRequestsPaid(serviceRequests.map((r) => r._id)),
        ]);

        const checkOutResult = await hospitalityService.checkOutGuest(
            roomSessionId,
            checkedOutByUserId
        );

        if (!checkOutResult.success) {
            return { success: false, message: checkOutResult.message ?? "Failed to check out room" };
        }

        const hotelRes = await hospitalityService.getHotelById(input.hotelId);
        const chainId = hotelRes.success && hotelRes.data
            ? (() => {
                const c = (hotelRes.data as { chainId?: { _id?: unknown } | string }).chainId;
                return c ? (typeof c === "object" && c._id ? String(c._id) : String(c)) : undefined;
            })()
            : undefined;

        let totalDiscountAmount = 0;
        let totalDamageCharges = 0;
        let totalOtherCharges = 0;
        for (const a of input.adjustments) {
            const amt = Math.abs(a.amount);
            if (a.type === "DISCOUNT") totalDiscountAmount += amt;
            else if (a.type === "DAMAGE") totalDamageCharges += amt;
            else totalOtherCharges += amt;
        }

        publishCheckoutEvent({
            event: "GUEST_CHECKED_OUT",
            checkoutSessionId: checkoutSession._id.toString(),
            hotelId: input.hotelId,
            chainId,
            roomNumber: sessionResult.data.roomNumber,
            finalAmount,
            totalDiscountAmount,
            totalDamageCharges,
            totalOtherCharges,
            paymentMethod: input.paymentMethod,
            paidAt: new Date().toISOString(),
        }).catch(() => {});

        return {
            success: true,
            data: {
                checkoutSessionId: checkoutSession._id.toString(),
                finalAmount,
                roomNumber: sessionResult.data.roomNumber,
                hotelId: input.hotelId,
            },
        };
    },
};
