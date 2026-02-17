import { ClientSession, Types } from "mongoose";
import { customAlphabet } from "nanoid";
import path from "path";
import { readFile } from "fs/promises";
import QRCode from "qrcode";
import { getRedis } from "../../infra/redis/redis.js";
import { runInTransaction } from "../../infra/db/transaction.js";
import QrSet from "./db/qr-sets.model.js";
import QrCode from "./db/qr-code.model.js";
import {
    ServiceResult,
    ICreateQrSetInput,
    IGenerateQrCodesInput,
    IAddSingleQrCodeInput,
    IToggleQrStatusInput,
    IQrCodeInfo,
    IQrCodeInfoWithRoomStatus,
    IFloorWithRooms,
    QrCodeAuditContext,
} from "./qr-code.types.js";
import { publishAuditEvent } from "../audit/audit.publisher.js";
import logger from "../../helpers/logger/index.js";

class QrCodeService {
    private readonly CACHE_TTL_SECONDS = 60 * 10; // 10 minutes
    private readonly CACHE_TTL_GROUPED_SECONDS = 60; // 1 minute for grouped (roomStatus freshness)
    private readonly cacheKey = {
        qrSet: (hotelId: string) => `qr:${hotelId}:set`,
        qrCodes: (hotelId: string, type: string, status?: string) => `qr:${hotelId}:codes:${type}:${status ?? "ALL"}`,
        qrCodesGrouped: (hotelId: string, type: string, status?: string) => `qr:${hotelId}:grouped:${type}:${status ?? "ALL"}`,
        locations: (hotelId: string, type: string) => `qr:${hotelId}:locations:${type}`,
        scan: (code: string) => `qr:scan:${code}`,
    };

    private async invalidateHotelCache(hotelId: string): Promise<void> {
        const redis = getRedis();
        let cursor = "0";
        const pattern = `qr:${hotelId}:*`;
        do {
            const res = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
            cursor = String(res.cursor);
            if (res.keys.length) await redis.del(res.keys);
        } while (cursor !== "0");
    }

    /**
     * Invalidate all QR cache for a hotel (e.g. after check-in/check-out so room list + roomStatus/stats are fresh).
     * Public so hospitality (and others) can call when room session state changes.
     */
    async invalidateHotelQrCache(hotelId: string): Promise<void> {
        await this.invalidateHotelCache(hotelId);
    }

    /**
     * Returns whether the given room number exists for the hotel (ROOM-type QR code, isActive).
     * Tries grouped ROOM cache first; on cache miss, checks DB.
     */
    async isValidRoomForHotel(hotelId: string, roomNumber: string): Promise<boolean> {
        const trimmed = roomNumber.trim();
        const redis = getRedis();
        const cacheKey = this.cacheKey.qrCodesGrouped(hotelId, "ROOM", undefined);
        const cached = await redis.get(cacheKey);
        if (cached) {
            const data: IFloorWithRooms[] = JSON.parse(cached);
            for (const group of data) {
                if (group.rooms.some((r) => r.roomNumber === trimmed)) return true;
            }
            return false;
        }
        const set = await QrSet.findOne({ hotelId: new Types.ObjectId(hotelId) }).select("_id").lean();
        if (!set) return false;
        const exists = await QrCode.exists({
            qrSetId: set._id,
            type: "ROOM",
            roomNumber: trimmed,
            isActive: true,
        });
        return !!exists;
    }

    private async invalidateScanCacheByCode(code: string): Promise<void> {
        const redis = getRedis();
        await redis.del(this.cacheKey.scan(code));
    }

    // Custom alphabet for QR codes (avoiding confusing characters: 0/O, 1/I/l)
    private readonly qrCodeGenerator = customAlphabet(
        "23456789ABCDEFGHJKLMNPQRSTUVWXYZ",
        10
    );

    private generateCodeString(): string {
        return `TMQR-${this.qrCodeGenerator()}`;
    }

    private async ensureActiveQrSetForHotel(
        hotelId: string,
        session?: ClientSession
    ): Promise<ServiceResult<{ qrSetId: string }>> {
        const existing = await QrSet.findOne({ hotelId }).session(session || null);
        if (existing) {
            if (!existing.isActive || existing.status !== "ACTIVE") {
                return { success: false, message: "QR Set is inactive for this hotel" };
            }
            return { success: true, message: "QR Set exists", data: { qrSetId: existing._id.toString() } };
        }

        // Create default set if missing (sync invariant: one set per hotel)
        const created = await QrSet.create(
            [
                {
                    hotelId: new Types.ObjectId(hotelId),
                    status: "ACTIVE",
                    isActive: true,
                },
            ],
            session ? { session } : undefined
        );

        return { success: true, message: "QR Set created", data: { qrSetId: created[0]!._id.toString() } };
    }

    async createDefaultQrSetForHotel(
        input: ICreateQrSetInput
    ): Promise<ServiceResult<{ qrSetId: string }>> {
        try {
            const { hotelId, session } = input;

            const existingSet = await QrSet.findOne({ hotelId }).session(session || null).lean();
            if (existingSet) {
                return {
                    success: true,
                    message: "QR Set already exists for this hotel",
                    data: { qrSetId: existingSet._id.toString() },
                };
            }

            const qrSet = new QrSet({
                hotelId: new Types.ObjectId(hotelId),
                status: "ACTIVE",
                isActive: true,
            });

            if (session) {
                await qrSet.save({ session });
            } else {
                await qrSet.save();
            }

            return {
                success: true,
                message: "QR Set created successfully",
                data: { qrSetId: qrSet._id.toString() },
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || "Failed to create QR Set",
            };
        }
    }

    /**
     * Get QR Set by Hotel ID
     */
    async getQrSetByHotelId(hotelId: string): Promise<ServiceResult<{ id: string; hotelId: string; status: string; qrCodeCount: number; isActive: boolean; createdAt: Date }>> {
        try {
            const redis = getRedis();
            const cached = await redis.get(this.cacheKey.qrSet(hotelId));
            if (cached) {
                return { success: true, message: "QR Set fetched successfully", data: JSON.parse(cached) };
            }

            const rows = await QrSet.aggregate([
                { $match: { hotelId: new Types.ObjectId(hotelId) } },
                {
                    $lookup: {
                        from: "qrcodes",
                        let: { setId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$qrSetId", "$$setId"] },
                                    status: "ACTIVE",
                                    isActive: true,
                                },
                            },
                            { $count: "count" },
                        ],
                        as: "qrCounts",
                    },
                },
                {
                    $addFields: {
                        qrCodeCount: { $ifNull: [{ $arrayElemAt: ["$qrCounts.count", 0] }, 0] },
                    },
                },
                {
                    $project: {
                        _id: 1,
                        hotelId: 1,
                        status: 1,
                        isActive: 1,
                        createdAt: 1,
                        qrCodeCount: 1,
                    },
                },
                { $limit: 1 },
            ]);

            const qrSet = rows[0];
            if (!qrSet) return { success: false, message: "QR Set not found for this hotel" };

            const data = {
                id: qrSet._id.toString(),
                hotelId: qrSet.hotelId.toString(),
                status: qrSet.status,
                qrCodeCount: qrSet.qrCodeCount,
                isActive: qrSet.isActive,
                createdAt: qrSet.createdAt,
            };

            await redis.setEx(this.cacheKey.qrSet(hotelId), this.CACHE_TTL_SECONDS, JSON.stringify(data));

            return {
                success: true,
                message: "QR Set fetched successfully",
                data
            };
        } catch (error: any) {
            return { success: false, message: error.message || "Failed to fetch QR Set" };
        }
    }

    /**
     * Unified Bulk Generate QR Codes
     */
    async generateQrCodes(
        hotelId: string,
        input: IGenerateQrCodesInput,
        auditContext?: QrCodeAuditContext
    ): Promise<ServiceResult<{ created: number; failed: string[] }>> {
        return await runInTransaction(async (session) => {
            const setRes = await this.ensureActiveQrSetForHotel(hotelId, session);
            if (!setRes.success || !setRes.data) return { success: false, message: setRes.message };

            const qrSetId = new Types.ObjectId(setRes.data.qrSetId);

            // Build desired locations list and validate duplicates inside request
            const locationKeySet = new Set<string>();
            const desiredRoomNumbers: string[] = [];
            const desiredTableKeys: { zone: string; tableNumber: string }[] = [];

            for (const conf of input.config) {
                for (let i = 0; i < conf.count; i++) {
                    const num = conf.startFrom + i;
                    const identifier = conf.prefix ? `${conf.prefix}${num}` : `${num}`;
                    if (input.type === "ROOM") {
                        const key = `ROOM:${identifier}`;
                        if (locationKeySet.has(key)) {
                            return { success: false, message: `Duplicate roomNumber in request: ${identifier}` };
                        }
                        locationKeySet.add(key);
                        desiredRoomNumbers.push(identifier);
                    } else {
                        const key = `${input.type}:${conf.name}:${identifier}`;
                        if (locationKeySet.has(key)) {
                            return { success: false, message: `Duplicate table in request: ${conf.name} - ${identifier}` };
                        }
                        locationKeySet.add(key);
                        desiredTableKeys.push({ zone: conf.name, tableNumber: identifier });
                    }
                }
            }

            // Pre-check duplicates in DB (fail fast, all-or-nothing)
            if (input.type === "ROOM") {
                const existing = await QrCode.findOne({
                    qrSetId,
                    type: "ROOM",
                    roomNumber: { $in: desiredRoomNumbers },
                })
                    .select("roomNumber")
                    .session(session)
                    .lean();

                if (existing?.roomNumber) {
                    return { success: false, message: `QR already exists for room: ${existing.roomNumber}` };
                }
            } else {
                // For RESTAURANT/BAR, check any existing doc matching any requested (zone, tableNumber)
                const or = desiredTableKeys.map((t) => ({ zone: t.zone, tableNumber: t.tableNumber }));
                const existing = await QrCode.findOne({
                    qrSetId,
                    type: { $in: ["RESTAURANT", "BAR"] },
                    $or: or,
                })
                    .select("zone tableNumber")
                    .session(session)
                    .lean();

                if (existing?.zone && existing?.tableNumber) {
                    return { success: false, message: `QR already exists for table: ${existing.zone} - ${existing.tableNumber}` };
                }
            }

            const newQrCodes: any[] = [];

            for (const conf of input.config) {
                for (let i = 0; i < conf.count; i++) {
                    const num = conf.startFrom + i;
                    const identifier = conf.prefix ? `${conf.prefix}${num}` : `${num}`;

                    // generate code with collision retry
                    let finalCode = this.generateCodeString();
                    let retries = 5;
                    while (retries > 0 && (await QrCode.exists({ code: finalCode }).session(session))) {
                        finalCode = this.generateCodeString();
                        retries--;
                    }

                    const qrDoc: any = {
                        qrSetId,
                        code: finalCode,
                        type: input.type,
                        status: "ACTIVE",
                        isActive: true,
                    };

                    if (input.type === "ROOM") {
                        qrDoc.floor = conf.name;
                        qrDoc.roomNumber = identifier;
                    } else {
                        qrDoc.zone = conf.name;
                        qrDoc.tableNumber = identifier;
                    }

                    newQrCodes.push(qrDoc);
                }
            }

            await QrCode.insertMany(newQrCodes, { session, ordered: true });

            await this.invalidateHotelCache(hotelId);

            if (auditContext) {
                publishAuditEvent(
                    "QR_CODES_GENERATED",
                    "HOTEL",
                    hotelId,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { count: newQrCodes.length, type: input.type } }
                ).catch(() => {});
            }

            return {
                success: true,
                message: `Successfully generated ${newQrCodes.length} QR codes`,
                data: { created: newQrCodes.length, failed: [] },
            };
        });
    }

    /**
     * Add Single QR Code
     */
    async addSingleQrCode(
        hotelId: string,
        input: IAddSingleQrCodeInput,
        auditContext?: QrCodeAuditContext
    ): Promise<ServiceResult<IQrCodeInfo>> {
        return await runInTransaction(async (session) => {
            const setRes = await this.ensureActiveQrSetForHotel(hotelId, session);
            if (!setRes.success || !setRes.data) return { success: false, message: setRes.message };

            const qrSetId = new Types.ObjectId(setRes.data.qrSetId);

            // Check duplicate (fail fast)
            const query: any = { qrSetId, type: input.type };
            if (input.type === "ROOM") {
                query.roomNumber = input.roomNumber;
            } else {
                query.tableNumber = input.tableNumber;
                query.zone = input.zone;
            }

            const exists = await QrCode.findOne(query).session(session).lean();
            if (exists) {
                return { success: false, message: "QR Code already exists for this location" };
            }

            // Generate code with collision retry
            let finalCode = this.generateCodeString();
            let retries = 5;
            while (retries > 0 && (await QrCode.exists({ code: finalCode }).session(session))) {
                finalCode = this.generateCodeString();
                retries--;
            }

            const created = await QrCode.create(
                [
                    {
                        qrSetId,
                        code: finalCode,
                        ...input,
                        status: "ACTIVE",
                        isActive: true,
                    },
                ],
                { session }
            );

            await this.invalidateHotelCache(hotelId);
            await this.invalidateScanCacheByCode(finalCode);

            if (auditContext) {
                publishAuditEvent(
                    "QR_CODE_ADDED",
                    "HOTEL",
                    hotelId,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId }, newData: { codeId: created[0]._id.toString(), type: input.type } }
                ).catch(() => {});
            }

            return {
                success: true,
                message: "QR Code added successfully",
                data: this.mapToInfo(created[0]),
            };
        });
    }

    /**
     * Get QR Codes (Filtered) – grouped by floor (ROOM) or zone (RESTAURANT/BAR).
     * For ROOM type, each room includes roomStatus: OCCUPIED | VACANT from active room sessions.
     */
    async getQrCodes(
        hotelId: string,
        type: "ROOM" | "RESTAURANT" | "BAR",
        status?: "ACTIVE" | "INACTIVE"
    ): Promise<ServiceResult<IFloorWithRooms[]>> {
        try {
            const redis = getRedis();
            const cacheKeyGrouped = this.cacheKey.qrCodesGrouped(hotelId, type, status);
            const cached = await redis.get(cacheKeyGrouped);
            if (cached) {
                return { success: true, message: "QR Codes fetched", data: JSON.parse(cached) };
            }

            const match: any = { type, isActive: true };
            if (status) match.status = status;

            const rows = await QrSet.aggregate([
                { $match: { hotelId: new Types.ObjectId(hotelId) } },
                {
                    $lookup: {
                        from: "qrcodes",
                        let: { setId: "$_id" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$qrSetId", "$$setId"] }, ...match } },
                            { $sort: { floor: 1, roomNumber: 1, zone: 1, tableNumber: 1, createdAt: 1 } },
                            {
                                $project: {
                                    _id: 1,
                                    code: 1,
                                    type: 1,
                                    floor: 1,
                                    roomNumber: 1,
                                    zone: 1,
                                    tableNumber: 1,
                                    status: 1,
                                    isActive: 1,
                                    createdAt: 1,
                                },
                            },
                        ],
                        as: "codes",
                    },
                },
                { $project: { codes: 1 } },
                { $limit: 1 },
            ]);

            if (!rows.length) return { success: false, message: "QR Set not found" };
            const codes = (rows[0]?.codes ?? []).map((doc: any) => this.mapToInfo(doc)) as IQrCodeInfo[];

            const groupByField = type === "ROOM" ? "floor" : "zone";
            const occupiedRoomsStatsMap = new Map<string, { totalOrders: number; totalFoodOrders: number; totalServiceRequests: number; totalSpend: number }>();
            if (type === "ROOM") {
                const hospitalityService = (await import("../hospitality/hospitality.service.js")).default;
                const occupiedWithStats = await hospitalityService.getOccupiedRoomsWithStats(hotelId);
                for (const { roomNumber, stats } of occupiedWithStats) {
                    occupiedRoomsStatsMap.set(roomNumber, stats);
                }
            }

            const groupMap = new Map<string, IQrCodeInfoWithRoomStatus[]>();
            for (const code of codes) {
                const groupKey = (code[groupByField as keyof IQrCodeInfo] as string) ?? "";
                const room: IQrCodeInfoWithRoomStatus = { ...code };
                if (type === "ROOM" && code.roomNumber != null) {
                    const stats = occupiedRoomsStatsMap.get(code.roomNumber);
                    room.roomStatus = stats != null ? "OCCUPIED" : "VACANT";
                    if (stats != null) room.stats = stats;
                }
                if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
                groupMap.get(groupKey)!.push(room);
            }

            const data: IFloorWithRooms[] = Array.from(groupMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([floor, rooms]) => ({ floor, rooms }));

            await redis.setEx(cacheKeyGrouped, this.CACHE_TTL_GROUPED_SECONDS, JSON.stringify(data));

            return {
                success: true,
                message: "QR Codes fetched",
                data,
            };
        } catch (error: any) {
            return { success: false, message: error.message || "Failed to fetch QR codes" };
        }
    }

    /**
     * Toggle QR Code Status (Activate/Deactivate)
     * Only updates status, keeps isActive: true (so code remains visible)
     */
    async toggleQrStatus(
        codeId: string,
        input: IToggleQrStatusInput,
        auditContext?: QrCodeAuditContext
    ): Promise<ServiceResult> {
        return await runInTransaction(async (session) => {
            const existing = await QrCode.findOne({ _id: codeId, isActive: true }).session(session);
            if (!existing) return { success: false, message: "QR Code not found or already deleted" };

            const updateData: any = {
                status: input.isActive ? "ACTIVE" : "INACTIVE",
            };

            if (!input.isActive) {
                updateData.reasonOfDeactivation = input.reason || null;
                updateData.deactivatedAt = new Date();
            } else {
                updateData.reasonOfDeactivation = null;
                updateData.deactivatedAt = null;
            }

            await QrCode.updateOne({ _id: existing._id }, { $set: updateData }).session(session);

            const qrSet = await QrSet.findById(existing.qrSetId).select("hotelId").session(session).lean();
            const hotelIdStr = qrSet?.hotelId?.toString();
            if (hotelIdStr) {
                await this.invalidateHotelCache(hotelIdStr);
            }
            await this.invalidateScanCacheByCode(existing.code);

            if (auditContext && hotelIdStr) {
                publishAuditEvent(
                    "QR_CODE_STATUS_CHANGED",
                    "HOTEL",
                    hotelIdStr,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId: hotelIdStr }, newData: { codeId, isActive: input.isActive } }
                ).catch(() => {});
            }

            return { success: true, message: `QR Code marked as ${input.isActive ? "Active" : "Inactive"}` };
        });
    }

    /**
     * Delete QR Code (Soft Delete)
     * Sets isActive: false (completely hidden from queries)
     */
    async deleteQrCode(
        codeId: string,
        reason?: string,
        auditContext?: QrCodeAuditContext
    ): Promise<ServiceResult> {
        return await runInTransaction(async (session) => {
            const existing = await QrCode.findOne({ _id: codeId, isActive: true }).session(session);
            if (!existing) return { success: false, message: "QR Code not found or already deleted" };

            const updateData: any = {
                isActive: false,
                status: "INACTIVE",
                reasonOfDeactivation: reason || "Deleted by user",
                deactivatedAt: new Date(),
            };

            await QrCode.updateOne({ _id: existing._id }, { $set: updateData }).session(session);

            const qrSet = await QrSet.findById(existing.qrSetId).select("hotelId").session(session).lean();
            const hotelIdStr = qrSet?.hotelId?.toString();
            if (hotelIdStr) {
                await this.invalidateHotelCache(hotelIdStr);
            }
            await this.invalidateScanCacheByCode(existing.code);

            if (auditContext && hotelIdStr) {
                publishAuditEvent(
                    "QR_CODE_DELETED",
                    "HOTEL",
                    hotelIdStr,
                    auditContext.actor,
                    { context: { ...auditContext.context, hotelId: hotelIdStr }, newData: { codeId } }
                ).catch(() => {});
            }

            return { success: true, message: "QR Code deleted successfully" };
        });
    }

    /**
     * Get Distinct Locations
     */
    async getDistinctLocations(
        hotelId: string,
        type: "ROOM" | "RESTAURANT" | "BAR"
    ): Promise<ServiceResult<string[]>> {
        try {
            const redis = getRedis();
            const cacheKey = this.cacheKey.locations(hotelId, type);
            const cached = await redis.get(cacheKey);
            if (cached) {
                return { success: true, message: "Locations fetched", data: JSON.parse(cached) };
            }

            const field = type === "ROOM" ? "floor" : "zone";
            const rows = await QrSet.aggregate([
                { $match: { hotelId: new Types.ObjectId(hotelId) } },
                {
                    $lookup: {
                        from: "qrcodes",
                        let: { setId: "$_id" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$qrSetId", "$$setId"] }, type, isActive: true } }, // Only non-deleted codes
                            { $match: { [field]: { $type: "string" } } },
                            { $group: { _id: `$${field}` } },
                            { $sort: { _id: 1 } },
                        ],
                        as: "locs",
                    },
                },
                { $project: { locs: 1 } },
                { $limit: 1 },
            ]);

            if (!rows.length) return { success: false, message: "QR Set not found" };
            const data = (rows[0]?.locs ?? []).map((x: any) => x._id);
            await redis.setEx(cacheKey, this.CACHE_TTL_SECONDS, JSON.stringify(data));

            return {
                success: true,
                message: "Locations fetched",
                data
            };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    }

    private mapToInfo(doc: any): IQrCodeInfo {
        return {
            id: doc._id.toString(),
            code: doc.code,
            type: doc.type,
            floor: doc.floor,
            roomNumber: doc.roomNumber,
            zone: doc.zone,
            tableNumber: doc.tableNumber,
            status: doc.status,
            isActive: doc.isActive,
            createdAt: doc.createdAt
        };
    }


    async getQrCodeByCode(code: string): Promise<ServiceResult<IQrCodeInfo & { hotelId: string } | null>> {
        try {
            const redis = getRedis();
            const cached = await redis.get(this.cacheKey.scan(code));
            if (cached) {
                return { success: true, message: "QR Code found", data: JSON.parse(cached) };
            }

            const rows = await QrCode.aggregate([
                { $match: { code, isActive: true } }, // Only non-deleted codes can be scanned
                {
                    $lookup: {
                        from: "qrsets",
                        localField: "qrSetId",
                        foreignField: "_id",
                        as: "set",
                    },
                },
                { $unwind: "$set" },
                { $match: { "set.isActive": true } },
                {
                    $project: {
                        _id: 1,
                        code: 1,
                        type: 1,
                        floor: 1,
                        roomNumber: 1,
                        zone: 1,
                        tableNumber: 1,
                        status: 1,
                        isActive: 1,
                        createdAt: 1,
                        hotelId: "$set.hotelId",
                    },
                },
                { $limit: 1 },
            ]);

            if (!rows.length) {
                return { success: true, message: "QR Code not found", data: null };
            }

            const doc: any = rows[0];
            const data = {
                ...this.mapToInfo(doc),
                hotelId: doc.hotelId.toString(),
            };

            await redis.setEx(this.cacheKey.scan(code), this.CACHE_TTL_SECONDS, JSON.stringify(data));

            return {
                success: true,
                message: "QR Code found",
                data,
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || "Failed to get QR code",
            };
        }
    }

    /**
     * Get QR codes for PDF download: filter by type and optional floor/room or zone/table.
     * Returns list of active codes for the hotel's QR set.
     */
    async getQrCodesForDownload(
        hotelId: string,
        query: { type: "ROOM" | "RESTAURANT" | "BAR"; floor?: string; roomNumber?: string; zone?: string; tableNumber?: string }
    ): Promise<ServiceResult<IQrCodeInfo[]>> {
        try {
            const set = await QrSet.findOne({ hotelId: new Types.ObjectId(hotelId) }).select("_id").lean();
            if (!set) return { success: false, message: "QR Set not found for this hotel" };

            const filter: Record<string, unknown> = {
                qrSetId: set._id,
                type: query.type,
                isActive: true,
            };

            if (query.type === "ROOM") {
                if (query.floor) filter.floor = query.floor;
                if (query.roomNumber) filter.roomNumber = query.roomNumber;
            } else {
                if (query.zone) filter.zone = query.zone;
                if (query.tableNumber) filter.tableNumber = query.tableNumber;
            }

            const docs = await QrCode.find(filter)
                .select("code type floor roomNumber zone tableNumber")
                .sort({ floor: 1, roomNumber: 1, zone: 1, tableNumber: 1 })
                .lean();

            const list = docs.map((d: any) => this.mapToInfo(d)) as IQrCodeInfo[];
            if (list.length === 0) {
                return { success: false, message: "No QR codes found for the given filters" };
            }

            return { success: true, message: "OK", data: list };
        } catch (error: any) {
            return { success: false, message: error?.message ?? "Failed to fetch QR codes for download" };
        }
    }

    /**
     * Generate PDF buffer from QR codes using the HTML template.
     * ROOM QR codes use backend customer scan URL so scan triggers redirect flow (login → room session → cookies).
     * Hotel logo from options (from hospitality service) or env fallback.
     */
    async generateQrPdf(
        codes: IQrCodeInfo[],
        options?: { hotelLogoUrl?: string }
    ): Promise<ServiceResult<Buffer>> {
        const customerScanBaseUrl =
            process.env.CUSTOMER_SCAN_BASE_URL ??
            process.env.BASE_URL ??
            "https://api.tablemitra.com";
        const hotelLogoUrl =
            options?.hotelLogoUrl ??
            process.env.QR_HOTEL_LOGO_URL ??
            "https://res.cloudinary.com/dpqsatnvt/image/upload/v1771284030/background_s5yeyd.png";

        try {
            const templateDir = path.join(process.cwd(), "src", "template");
            const [baseHtml, cardHtml] = await Promise.all([
                readFile(path.join(templateDir, "qr-code.html"), "utf-8"),
                readFile(path.join(templateDir, "qr-code-card.html"), "utf-8"),
            ]);

            const cards: string[] = [];
            for (const code of codes) {
                const scanUrl =
                    code.type === "ROOM"
                        ? `${customerScanBaseUrl.replace(/\/$/, "")}/api/v1/customer/scan/${code.code}`
                        : `${process.env.QR_SCAN_BASE_URL ?? process.env.FRONTEND_URL ?? "https://customer.tablemitra.com"}`.replace(/\/$/, "") + `/scan/${code.code}`;
                const qrDataUrl = await QRCode.toDataURL(scanUrl, { width: 150, margin: 0 });
                const label =
                    code.type === "ROOM"
                        ? (code.floor && code.roomNumber
                            ? `Floor ${code.floor} - Room ${code.roomNumber}`
                            : code.roomNumber
                                ? `Room ${code.roomNumber}`
                                : code.floor ?? code.code)
                        : (code.zone && code.tableNumber
                            ? `${code.zone} - Table ${code.tableNumber}`
                            : code.tableNumber
                                ? `Table ${code.tableNumber}`
                                : code.zone ?? code.code);

                const filled = cardHtml
                    .replace(/\{\{HOTEL_LOGO\}\}/g, hotelLogoUrl)
                    .replace(/\{\{ROOM_NUMBER\}\}/g, label || code.code)
                    .replace(/\{\{QR_CODE_URL\}\}/g, qrDataUrl);
                cards.push(`<div class="qr-card">${filled}</div>`);
            }

            const fullHtml = baseHtml.replace("{{CARDS}}", cards.join(""));

            const puppeteer = await import("puppeteer-core");
            const systemChrome = process.env.PUPPETEER_EXECUTABLE_PATH;
            const launchOpts: Parameters<typeof puppeteer.default.launch>[0] = {
                headless: true,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                ],
            };
            if (systemChrome) {
                launchOpts.executablePath = systemChrome;
            } else {
                const chromium = (await import("@sparticuz/chromium")).default;
                launchOpts.executablePath = await chromium.executablePath();
                launchOpts.args = chromium.args;
                launchOpts.defaultViewport = chromium.defaultViewport;
                launchOpts.headless = chromium.headless;
            }
            const browser = await puppeteer.default.launch(launchOpts);
            try {
                const page = await browser.newPage();
                await page.setContent(fullHtml, { waitUntil: "networkidle0" });
                const pdfBuffer = await page.pdf({
                    format: "A4",
                    printBackground: true,
                    margin: { top: 0, right: 0, bottom: 0, left: 0 },
                    preferCSSPageSize: false,
                });
                return { success: true, message: "OK", data: Buffer.from(pdfBuffer) };
            } finally {
                await browser.close();
            }
        } catch (error: any) {
            logger.error("QR PDF generation failed", { error: error?.message });
            return { success: false, message: error?.message ?? "Failed to generate PDF" };
        }
    }
}

export const qrCodeService = new QrCodeService();
