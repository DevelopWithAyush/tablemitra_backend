import { Types } from "mongoose";
import CheckoutSessionModel from "./db/checkout-session.model.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import { publishCheckoutEvent } from "./checkout.analytics.publisher.js";
import { foodOrderService } from "../orders/food-order.service.js";
import { serviceRequestService } from "../orders/service-request.service.js";
import type {
    CheckoutPreview,
    CheckoutAdjustmentInput,
    ProceedCheckoutInput,
    CheckoutHistoryItem,
} from "./checkout.types.js";
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

type CheckoutSessionLean = {
    _id: unknown;
    hotelId: unknown;
    roomSessionId: unknown;
    roomNumber: string;
    foodOrderIds?: unknown[];
    serviceRequestIds?: unknown[];
    ordersSubtotal: number;
    adjustments?: Array<{ type: string; amount: number; label?: string | null }>;
    finalAmount: number;
    guestDetails?: { name?: string | null; phone?: string | null };
};

async function buildPreviewFromCheckoutSession(
    session: CheckoutSessionLean
): Promise<{ success: boolean; message?: string; data?: CheckoutPreview }> {
    const checkoutSessionId = (session._id as Types.ObjectId).toString();
    const roomSessionId = (session.roomSessionId as Types.ObjectId).toString();
    const hotelId = (session.hotelId as Types.ObjectId).toString();
    const foodOrderIds = (session.foodOrderIds ?? []).map((id) => (id as Types.ObjectId).toString());
    const serviceRequestIds = (session.serviceRequestIds ?? []).map((id) => (id as Types.ObjectId).toString());

    const [foodOrdersRaw, serviceRequestsRaw] = await Promise.all([
        foodOrderService.getFoodOrdersByIdsForBill(foodOrderIds),
        serviceRequestService.getServiceRequestsByIdsForBill(serviceRequestIds),
    ]);

    const foodOrdersMapped = foodOrdersRaw.map((o) => ({
        _id: o._id,
        items: o.items ?? [],
        bill: o.bill ?? { subtotal: 0, toPay: 0 },
        count: o.count ?? 0,
        createdAt: o.createdAt ?? new Date().toISOString(),
    }));
    const serviceRequestsMapped = serviceRequestsRaw.map((r) => ({
        _id: r._id,
        items: r.items ?? [],
        totalAmount: r.totalAmount ?? 0,
        bill: { toPay: (r as { bill?: { toPay?: number }; totalAmount?: number }).bill?.toPay ?? r.totalAmount ?? 0 },
        createdAt: r.createdAt ?? new Date().toISOString(),
    }));

    const guestDetails = session.guestDetails && (session.guestDetails.name || session.guestDetails.phone)
        ? [{ name: session.guestDetails.name ?? undefined, phone: session.guestDetails.phone ?? undefined }]
        : undefined;

    return {
        success: true,
        data: {
            roomSessionId,
            roomNumber: session.roomNumber,
            hotelId,
            checkoutSessionId,
            isAlreadyCheckout: true,
            foodOrders: foodOrdersMapped as CheckoutPreview["foodOrders"],
            serviceRequests: serviceRequestsMapped as CheckoutPreview["serviceRequests"],
            ordersSubtotal: session.ordersSubtotal,
            adjustments: (session.adjustments ?? []).map((a) => ({
                type: a.type,
                amount: a.amount,
                ...(a.label != null && { label: a.label }),
            })),
            finalAmount: session.finalAmount,
            guestDetails,
        },
    };
}

export const checkoutService = {
    /**
     * Get checkout preview. Accepts roomSessionId (active or checked-out) or checkoutSessionId (past checkout).
     * When room is ACTIVE: isAlreadyCheckout=false, show Proceed + Print. When CHECKED_OUT: isAlreadyCheckout=true, show only Print.
     */
    getCheckoutPreview: async (
        options: { roomSessionId?: string; checkoutSessionId?: string }
    ): Promise<{ success: boolean; message?: string; data?: CheckoutPreview }> => {
        const { roomSessionId: rid, checkoutSessionId: cid } = options;
        if (!rid && !cid) {
            return { success: false, message: "Either roomSessionId or checkoutSessionId is required" };
        }

        if (cid) {
            const session = await CheckoutSessionModel.findById(cid).lean();
            if (!session) {
                return { success: false, message: "Checkout session not found" };
            }
            return buildPreviewFromCheckoutSession(session as unknown as CheckoutSessionLean);
        }

        const ridVal = rid!;
        const sessionResult = await hospitalityService.getRoomSessionById(ridVal);
        if (!sessionResult.success || !sessionResult.data) {
            return { success: false, message: sessionResult.message ?? "Room session not found" };
        }

        const { hotelId, roomNumber, status } = sessionResult.data;
        const isAlreadyCheckout = status === "CHECKED_OUT";

        if (isAlreadyCheckout) {
            const checkoutSession = await CheckoutSessionModel.findOne(
                { roomSessionId: ridVal }
            )
                .sort({ createdAt: -1 })
                .lean();
            if (!checkoutSession) {
                return { success: false, message: "Checkout record not found for this room session" };
            }
            return buildPreviewFromCheckoutSession(checkoutSession as unknown as CheckoutSessionLean);
        }

        const [foodOrders, serviceRequests, roomSession] = await Promise.all([
            foodOrderService.getPendingFoodOrdersByRoomSessionId(ridVal),
            serviceRequestService.getPendingServiceRequestsByRoomSessionId(ridVal),
            hospitalityService.getRoomSessionById(ridVal),
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
                roomSessionId: ridVal,
                roomNumber,
                hotelId,
                isAlreadyCheckout: false,
                foodOrders: foodOrdersMapped as CheckoutPreview["foodOrders"],
                serviceRequests: serviceRequestsMapped as CheckoutPreview["serviceRequests"],
                ordersSubtotal,
                guestDetails,
            },
        };
    },

    getCheckoutHistory: async (
        hotelId: string,
        query: { search?: string; page: number; limit: number }
    ): Promise<{
        success: boolean;
        message?: string;
        data?: { items: CheckoutHistoryItem[]; total: number; page: number; limit: number };
    }> => {
        const { search, page, limit } = query;
        const filter: Record<string, unknown> = { hotelId: new Types.ObjectId(hotelId) };

        if (search && search.trim()) {
            const s = search.trim();
            const isMongoId = /^[0-9a-fA-F]{24}$/.test(s);
            const conditions: Record<string, unknown>[] = [];
            conditions.push({ roomNumber: { $regex: s, $options: "i" } });
            if (s.length >= 2) {
                conditions.push({ "guestDetails.name": { $regex: s, $options: "i" } });
                conditions.push({ "guestDetails.phone": { $regex: s, $options: "i" } });
            }
            if (isMongoId) {
                conditions.push({ roomSessionId: new Types.ObjectId(s) });
                conditions.push({ _id: new Types.ObjectId(s) });
            }
            filter.$or = conditions;
        }

        const [items, total] = await Promise.all([
            CheckoutSessionModel.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select("_id roomSessionId roomNumber paidAt finalAmount guestDetails")
                .lean(),
            CheckoutSessionModel.countDocuments(filter),
        ]);

        const result: CheckoutHistoryItem[] = items.map((doc) => ({
            checkoutSessionId: (doc._id as Types.ObjectId).toString(),
            roomSessionId: (doc.roomSessionId as Types.ObjectId).toString(),
            roomNumber: doc.roomNumber as string,
            paidAt: (doc.paidAt as Date)?.toISOString?.() ?? new Date().toISOString(),
            finalAmount: doc.finalAmount as number,
            guestDetails: doc.guestDetails as { name?: string; phone?: string } | undefined,
        }));

        return {
            success: true,
            data: { items: result, total, page, limit },
        };
    },

    /**
     * Proceed checkout: apply adjustments, record payment method, mark orders paid, check out room.
     * No payment gateway – front desk processes offline.
     * Uses roomSessionId directly (from preview).
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
        const sessionResult = await hospitalityService.getRoomSessionById(input.roomSessionId);
        if (!sessionResult.success || !sessionResult.data) {
            return { success: false, message: sessionResult.message ?? "Room session not found" };
        }
        if (sessionResult.data.status !== "ACTIVE") {
            return { success: false, message: "Room is not active (already checked out)" };
        }

        const roomSessionId = input.roomSessionId;
        const hotelId = sessionResult.data.hotelId.toString();
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
                hotelId: new Types.ObjectId(hotelId),
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

        const hotelRes = await hospitalityService.getHotelById(hotelId);
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
            hotelId,
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
                hotelId,
            },
        };
    },
};
