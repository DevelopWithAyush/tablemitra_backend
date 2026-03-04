import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { IJwtPayload } from "../auth/auth.types.js";
import { serviceRequestService, serviceRequestToListItemWithCustomer } from "./service-request.service.js";
import { resolveServiceRequestTargetRoom } from "./order.routing.service.js";
import { publishServiceRequestEvent } from "./service-request.analytics.publisher.js";
import { publishAuditEvent } from "../audit/audit.publisher.js";
import type { ActorRole, AuditAction } from "../audit/audit.types.js";
import { SocketDispatcher } from "../../infra/socket/socket.dispatcher.js";
import { SOCKET_EVENTS } from "../../infra/socket/socket.events.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import type { ServiceRequestStatus } from "./db/service-request.model.js";
import type { PlaceServiceRequestBody } from "./service-request.validator.js";

const APP_TO_ACTOR_ROLE: Record<string, ActorRole> = {
    customer: "CUSTOMER",
    manager: "MANAGER",
    frontdesk: "FRONTDESK_STAFF",
    "room-service": "ROOM_SERVICE_STAFF",
    founder: "FOUNDER",
    admin: "ADMIN",
};

export class ServiceRequestController {
    placeServiceRequest = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const app = (req.params.app as string) ?? "";
        const { items, roomNumber, note } = req.body as PlaceServiceRequestBody;

        const customerRoomHotelId = req.cookies?.customer_room_hotel_id as string | undefined;
        const customerRoomSessionId = req.cookies?.customer_room_session_id as string | undefined;
        const customerRoomNumber = req.cookies?.customer_room_room_number as string | undefined;
        const staffHotelId = user.ctx?.type === "HOTEL" ? user.ctx.id : undefined;

        const request = await serviceRequestService.placeServiceRequest({
            userId: user.sub,
            app,
            items,
            note,
            customerRoomHotelId,
            customerRoomSessionId,
            customerRoomNumber,
            staffHotelId,
            staffRoomNumber: roomNumber,
        });

        const requestId = (request._id as { toString(): string }).toString();
        const hotelId = (request.hotelId as { toString(): string }).toString();
        const totalItems = request.items.reduce((s, i) => s + i.quantity, 0);

        // ── Resolve chain for analytics context ───────────────────────────
        const hotelRes = await hospitalityService.getHotelById(hotelId);
        const rawChain = hotelRes.success && hotelRes.data
            ? (hotelRes.data as { chainId?: { _id?: unknown } | string }).chainId
            : undefined;
        const chainId = rawChain
            ? (typeof rawChain === "object" && (rawChain as { _id?: unknown })._id
                ? String((rawChain as { _id: unknown })._id)
                : String(rawChain))
            : undefined;

        // ── Analytics ─────────────────────────────────────────────────────
        publishServiceRequestEvent({
            event: "SERVICE_REQUEST_CREATED",
            requestId,
            hotelId,
            chainId,
            totalAmount: request.totalAmount,
            totalItems,
            createdAt: (request.createdAt as Date).toISOString(),
        }).catch(() => {});

        // ── Audit ─────────────────────────────────────────────────────────
        publishAuditEvent(
            "SERVICE_REQUEST_CREATED",
            "SERVICE_REQUEST",
            requestId,
            { userId: user.sub, role: APP_TO_ACTOR_ROLE[app] ?? "CUSTOMER" },
            {
                context: { hotelId, chainId, ip: req.ip, userAgent: req.get("User-Agent") ?? undefined, panel: app },
                newData: {
                    roomNumber: request.roomNumber,
                    totalAmount: request.totalAmount,
                    itemCount: totalItems,
                    note: request.note ?? undefined,
                },
            }
        ).catch(() => {});

        // ── Socket: route alert to the active department ──────────────────
        const [requestPayload, { department }] = await Promise.all([
            serviceRequestToListItemWithCustomer(request),
            resolveServiceRequestTargetRoom(hotelId),
        ]);

        SocketDispatcher.emitToDepartment(hotelId, department, SOCKET_EVENTS.SERVICE_REQUEST_CREATED, requestPayload);
        SocketDispatcher.emitToHotel(hotelId, SOCKET_EVENTS.SERVICE_REQUEST_CREATED, { ...requestPayload, _routedTo: department });

        res.status(201).json({
            success: true,
            message: "Service request created successfully",
            data: request,
        });
    });

    getServiceRequests = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const app = (req.params.app as string) ?? "";
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const search = (req.query.search as string)?.trim();
        const status = (req.query.status as string) || undefined;

        const result = await serviceRequestService.getServiceRequests({
            userId: user.sub,
            app,
            ctxType: user.ctx?.type,
            ctxId: user.ctx?.id,
            page,
            limit,
            search,
            status,
        });

        res.status(200).json({
            success: true,
            data: result,
        });
    });

    updateServiceRequestStatus = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const app = (req.params.app as string) ?? "";
        const requestId = (req.params.requestId as string) ?? "";
        const { status } = req.body as { status: ServiceRequestStatus };

        const request = await serviceRequestService.updateServiceRequestStatus({
            requestId,
            newStatus: status,
            actorUserId: user.sub,
            app: (req.params.app as string) ?? "",
            ctxType: user.ctx?.type,
            ctxId: user.ctx?.id,
        });

        if (request) {
            const hotelId = (request.hotelId as { toString(): string }).toString();
            const roomSessionId = request.roomSessionId
                ? (request.roomSessionId as { toString(): string }).toString()
                : null;

            // ── Socket ────────────────────────────────────────────────────
            const socketEventMap: Record<string, string> = {
                ACCEPTED: SOCKET_EVENTS.SERVICE_REQUEST_ACCEPTED,
                REJECTED: SOCKET_EVENTS.SERVICE_REQUEST_REJECTED,
                IN_PROGRESS: SOCKET_EVENTS.SERVICE_REQUEST_IN_PROGRESS,
                COMPLETED: SOCKET_EVENTS.SERVICE_REQUEST_COMPLETED,
                CANCELLED: SOCKET_EVENTS.SERVICE_REQUEST_CANCELLED,
            };
            const socketEvent = socketEventMap[status] ?? SOCKET_EVENTS.SERVICE_REQUEST_ACCEPTED;
            const statusPayload = { requestId, status, hotelId };

            SocketDispatcher.emitToHotel(hotelId, socketEvent, statusPayload);
            if (roomSessionId) {
                SocketDispatcher.emitToRoom(roomSessionId, socketEvent, statusPayload);
            }

            // ── Analytics ─────────────────────────────────────────────────
            const analyticsEventMap: Record<string, "SERVICE_REQUEST_ACCEPTED" | "SERVICE_REQUEST_IN_PROGRESS" | "SERVICE_REQUEST_COMPLETED" | "SERVICE_REQUEST_REJECTED" | "SERVICE_REQUEST_CANCELLED"> = {
                ACCEPTED: "SERVICE_REQUEST_ACCEPTED",
                IN_PROGRESS: "SERVICE_REQUEST_IN_PROGRESS",
                COMPLETED: "SERVICE_REQUEST_COMPLETED",
                REJECTED: "SERVICE_REQUEST_REJECTED",
                CANCELLED: "SERVICE_REQUEST_CANCELLED",
            };
            const analyticsEvent = analyticsEventMap[status];
            if (analyticsEvent) {
                const now = new Date().toISOString();
                publishServiceRequestEvent({
                    event: analyticsEvent,
                    requestId,
                    hotelId,
                    totalAmount: request.totalAmount,
                    totalItems: request.items.reduce((s, i) => s + i.quantity, 0),
                    createdAt: (request.createdAt as Date).toISOString(),
                    previousStatus: request.status === status
                        ? undefined
                        : (request.status as string),
                    newStatus: status,
                    acceptedAt: status === "ACCEPTED" ? now : undefined,
                    startedAt: status === "IN_PROGRESS" ? now : undefined,
                    completedAt: status === "COMPLETED" ? now : undefined,
                    rejectedAt: status === "REJECTED" ? now : undefined,
                    cancelledAt: status === "CANCELLED" ? now : undefined,
                }).catch(() => {});
            }

            // ── Audit ─────────────────────────────────────────────────────
            const auditActionMap: Record<string, AuditAction> = {
                ACCEPTED: "SERVICE_REQUEST_ACCEPTED",
                IN_PROGRESS: "SERVICE_REQUEST_STARTED",
                COMPLETED: "SERVICE_REQUEST_COMPLETED",
                REJECTED: "SERVICE_REQUEST_REJECTED",
                CANCELLED: "SERVICE_REQUEST_CANCELLED",
            };
            const auditAction = auditActionMap[status];
            if (auditAction) {
                publishAuditEvent(
                    auditAction,
                    "SERVICE_REQUEST",
                    requestId,
                    { userId: user.sub, role: APP_TO_ACTOR_ROLE[app] ?? "FRONTDESK_STAFF" },
                    {
                        context: { hotelId, ip: req.ip, userAgent: req.get("User-Agent") ?? undefined, panel: app },
                        newData: { status },
                    }
                ).catch(() => {});
            }
        }

        res.status(200).json({
            success: true,
            message: "Service request status updated",
            data: request,
        });
    });
}
