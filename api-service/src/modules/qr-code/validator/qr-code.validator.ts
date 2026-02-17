import { z } from "zod";

// ==================== Common Schemas ====================

// ==================== Common Schemas ====================

const MongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID format");
const QrTypeSchema = z.enum(["ROOM", "RESTAURANT", "BAR"]);

// ==================== QR Code Schemas ====================

// 1. Unified Bulk Generate Schema
export const GenerateQrCodesSchema = z.object({
    body: z.object({
        type: QrTypeSchema,
        config: z.array(
            z.object({
                name: z.string().min(1, "Name is required (Floor or Zone)"), // Floor name or Zone name
                prefix: z.string().optional(), // Optional prefix for code generation
                count: z.number().int().min(1).max(100), // Number of codes to generate
                startFrom: z.number().int().min(1).default(1), // Starting number
            })
        ).min(1, "At least one config is required").max(20),
    }),
    params: z.object({
        hotelId: MongoIdSchema,
    }),
});

// 2. Get QR Codes Schema
export const GetQrCodesSchema = z.object({
    query: z.object({
        type: QrTypeSchema.optional().default("ROOM"),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    }),
    params: z.object({
        hotelId: MongoIdSchema,
    }),
});

// 3. Add Single QR Code Schema
export const AddSingleQrCodeSchema = z.object({
    body: z.object({
        type: QrTypeSchema,
        // For Rooms
        floor: z.string().optional(),
        roomNumber: z.string().optional(),
        // For Restaurants/Bars
        zone: z.string().optional(),
        tableNumber: z.string().optional(),
    }).refine((data) => {
        if (data.type === "ROOM") return !!data.floor && !!data.roomNumber;
        if (["RESTAURANT", "BAR"].includes(data.type)) return !!data.zone && !!data.tableNumber;
        return false;
    }, "Missing required fields for the selected type"),
    params: z.object({
        hotelId: MongoIdSchema,
    }),
});

// 4. Toggle Status Schema
export const ToggleQrStatusSchema = z.object({
    body: z.object({
        isActive: z.boolean(),
        reason: z.string().optional(),
    }),
    params: z.object({
        codeId: MongoIdSchema,
    }),
});

// 5. Get Locations Schema
export const GetLocationsSchema = z.object({
    query: z.object({
        type: QrTypeSchema,
    }),
    params: z.object({
        hotelId: MongoIdSchema,
    }),
});

// Legacy/Specific schemas (can be reused or removed if fully replaced)
export const HotelIdParamSchema = z.object({
    params: z.object({
        hotelId: MongoIdSchema,
    }),
});

export const ScanQrCodeSchema = z.object({
    params: z.object({
        code: z.string().regex(/^TMQR-[A-Z0-9]{10}$/, "Invalid QR code format"),
    }),
});

// 6. Delete QR Code Schema
export const DeleteQrCodeSchema = z.object({
    params: z.object({
        codeId: MongoIdSchema,
    }),
    body: z.object({
        reason: z.string().optional(),
    }),
});

// 7. Download QR Codes as PDF
const DownloadQuerySchema = z
    .object({
        type: QrTypeSchema,
        floor: z.string().min(1).max(100).optional(),
        roomNumber: z.string().min(1).max(50).optional(),
        zone: z.string().min(1).max(100).optional(),
        tableNumber: z.string().min(1).max(50).optional(),
    })
    .refine(
        (data) => {
            if (data.type === "ROOM") return data.zone === undefined && data.tableNumber === undefined;
            return data.floor === undefined && data.roomNumber === undefined;
        },
        { message: "For ROOM use only floor/roomNumber; for RESTAURANT/BAR use only zone/tableNumber" }
    );

export const DownloadQrCodesSchema = z.object({
    params: z.object({
        hotelId: MongoIdSchema,
    }),
    query: DownloadQuerySchema,
});
