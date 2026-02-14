import { Types, ClientSession } from "mongoose";
import { z } from "zod";
import type { AuditEventActor, AuditEventContext } from "../audit/audit.types.js";

/** Passed from controller so service can publish audit events (actor + request context). */
export interface QrCodeAuditContext {
    actor: AuditEventActor;
    context?: AuditEventContext;
}
import {
    GenerateQrCodesSchema,
    AddSingleQrCodeSchema,
    ToggleQrStatusSchema
} from "./validator/qr-code.validator.js";
import {
    GetQrCodesSchema,
    GetLocationsSchema,
    HotelIdParamSchema,
    ScanQrCodeSchema,
    DeleteQrCodeSchema
} from "./validator/qr-code.validator.js";

// ========================
// Service Result Types
// ========================
export interface ServiceResult<T = void> {
    success: boolean;
    message: string;
    data?: T;
}

export interface IQrSetDocument {
    _id: Types.ObjectId;
    hotelId: Types.ObjectId;
    status: "ACTIVE" | "INACTIVE";
    isActive: boolean;
    reasonOfDeactivation: string | null;
    deactivatedAt: Date | null;
    deactivatedBy: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICreateQrSetInput {
    hotelId: string;
    session?: ClientSession;
}

export interface IQrSetInfo {
    id: string;
    hotelId: string;
    status: string;
    qrCodeCount: number;
    isActive: boolean;
    createdAt: Date;
}

// ========================
// QR Code Types
// ========================
export interface IQrCodeDocument {
    _id: Types.ObjectId;
    qrSetId: Types.ObjectId;
    code: string;
    type: "ROOM" | "RESTAURANT" | "BAR";
    floor?: string;
    roomNumber?: string;
    zone?: string;
    tableNumber?: string;
    status: "ACTIVE" | "INACTIVE";
    isActive: boolean;
    reasonOfDeactivation: string | null;
    deactivatedAt: Date | null;
    deactivatedBy: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

// Zod Inferred Types
export type IGenerateQrCodesInput = z.infer<typeof GenerateQrCodesSchema>["body"];
export type IAddSingleQrCodeInput = z.infer<typeof AddSingleQrCodeSchema>["body"];
export type IToggleQrStatusInput = z.infer<typeof ToggleQrStatusSchema>["body"];

export type HotelIdParams = z.infer<typeof HotelIdParamSchema>["params"];
export type GetQrCodesParams = z.infer<typeof GetQrCodesSchema>["params"];
export type GetQrCodesQuery = z.infer<typeof GetQrCodesSchema>["query"];
export type GetLocationsParams = z.infer<typeof GetLocationsSchema>["params"];
export type GetLocationsQuery = z.infer<typeof GetLocationsSchema>["query"];
export type ScanQrCodeParams = z.infer<typeof ScanQrCodeSchema>["params"];
export type DeleteQrCodeParams = z.infer<typeof DeleteQrCodeSchema>["params"];
export type DeleteQrCodeBody = z.infer<typeof DeleteQrCodeSchema>["body"];

export interface IQrCodeInfo {
    id: string;
    code: string;
    type: string;
    floor?: string;
    roomNumber?: string;
    zone?: string;
    tableNumber?: string;
    status: string;
    isActive: boolean;
    createdAt: Date;
}

/** Room session stats (only when room is OCCUPIED). */
export interface IRoomSessionStats {
    totalOrders: number;
    totalFoodOrders: number;
    totalServiceRequests: number;
    totalSpend: number;
}

/** Room item with occupancy status and optional session stats (only for type ROOM). */
export interface IQrCodeInfoWithRoomStatus extends IQrCodeInfo {
    roomStatus?: "OCCUPIED" | "VACANT";
    /** Present when roomStatus is OCCUPIED. */
    stats?: IRoomSessionStats;
}

/** One group (by floor or zone) with its rooms/tables. Same shape for ROOM (floor) and RESTAURANT/BAR (zone as floor). */
export interface IFloorWithRooms {
    floor: string;
    rooms: IQrCodeInfoWithRoomStatus[];
}

export interface IDeactivateQrInput {
    reason: string;
    deactivatedBy: string;
}
