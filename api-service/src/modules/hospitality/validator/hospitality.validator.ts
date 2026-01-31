import { z } from "zod";

// ==================== Common Schemas ====================

const PhoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format");
const MongoIdSchema = z.string().length(24, "Invalid ID format");
const EmailSchema = z.string().email("Invalid email format").optional();

// ==================== Chain Schemas ====================

export const OnboardChainSchema = z.object({
    body: z.object({
        // Chain details
        name: z.string().min(2, "Chain name must be at least 2 characters").max(100),
        description: z.string().max(500).optional(),
        
        // Founder details (required for new chain)
        founderPhone: PhoneSchema,
        founderName: z.string().min(2, "Founder name must be at least 2 characters").max(100),
        founderEmail: EmailSchema,
        founderDesignation: z.string().max(50).optional(),

        // Optional settings
        settings: z.object({
            currency: z.string().default("INR"),
            timezone: z.string().default("Asia/Kolkata"),
            supportEmail: EmailSchema,
            supportPhone: PhoneSchema.optional(),
        }).optional(),
    }),
});

export const CreateChainSchema = z.object({
    body: z.object({
        name: z.string().min(2, "Chain name must be at least 2 characters").max(100),
        description: z.string().max(500).optional(),
        settings: z.object({
            currency: z.string().default("INR"),
            timezone: z.string().default("Asia/Kolkata"),
            supportEmail: EmailSchema,
            supportPhone: PhoneSchema.optional(),
        }).optional(),
    }),
});

// ==================== Hotel Schemas ====================

export const OnboardHotelSchema = z.object({
    body: z.object({
        // Hotel details
        name: z.string().min(2, "Hotel name must be at least 2 characters").max(100),
        description: z.string().max(500).optional(),

        // Address (required)
        address: z.object({
            street: z.string().max(200).optional(),
            city: z.string().min(2).max(100),
            state: z.string().min(2).max(100),
            country: z.string().default("India"),
            pincode: z.string().min(4).max(10),
            coordinates: z.object({
                lat: z.number().optional(),
                lng: z.number().optional(),
            }).optional(),
        }),

        // Contact (required)
        contact: z.object({
            phone: PhoneSchema,
            email: z.string().email("Invalid email"),
            website: z.string().url("Invalid website URL").optional(),
        }),

        // Manager details (required - first manager)
        managerPhone: PhoneSchema,
        managerName: z.string().min(2, "Manager name must be at least 2 characters").max(100),
        managerEmail: EmailSchema,

        // Optional settings
        totalRooms: z.number().int().min(1).optional(),
        settings: z.object({
            currency: z.string().default("INR"),
            timezone: z.string().default("Asia/Kolkata"),
            checkInTime: z.string().default("14:00"),
            checkOutTime: z.string().default("11:00"),
        }).optional(),
        panelSettings: z.object({
            kitchenEnabled: z.boolean().default(true),
            roomServiceEnabled: z.boolean().default(true),
            kitchenOfflineRedirect: z.enum(["FRONTDESK", "ROOM_SERVICE"]).default("FRONTDESK"),
        }).optional(),
    }),
    params: z.object({
        chainId: MongoIdSchema,
    }),
});

export const FounderOnboardHotelSchema = z.object({
    body: z.object({
        // Chain selection (from founder's chains)
        chainId: MongoIdSchema,

        // Hotel details
        name: z.string().min(2, "Hotel name must be at least 2 characters").max(100),
        description: z.string().max(500).optional(),

        // Address (required)
        address: z.object({
            street: z.string().max(200).optional(),
            city: z.string().min(2).max(100),
            state: z.string().min(2).max(100),
            country: z.string().default("India"),
            pincode: z.string().min(4).max(10),
            coordinates: z.object({
                lat: z.number().optional(),
                lng: z.number().optional(),
            }).optional(),
        }),

        // Contact (required)
        contact: z.object({
            phone: PhoneSchema,
            email: z.string().email("Invalid email"),
            website: z.string().url("Invalid website URL").optional(),
        }),

        // Manager details (required - first manager)
        managerPhone: PhoneSchema,
        managerName: z.string().min(2, "Manager name must be at least 2 characters").max(100),
        managerEmail: EmailSchema,

        // Optional settings
        totalRooms: z.number().int().min(1).optional(),
        settings: z.object({
            currency: z.string().default("INR"),
            timezone: z.string().default("Asia/Kolkata"),
            checkInTime: z.string().default("14:00"),
            checkOutTime: z.string().default("11:00"),
        }).optional(),
        panelSettings: z.object({
            kitchenEnabled: z.boolean().default(true),
            roomServiceEnabled: z.boolean().default(true),
            kitchenOfflineRedirect: z.enum(["FRONTDESK", "ROOM_SERVICE"]).default("FRONTDESK"),
        }).optional(),
    }),
});

// ==================== Chain Member Schemas ====================

export const AddChainMemberSchema = z.object({
    body: z.object({
        phone: PhoneSchema,
        name: z.string().min(2, "Name must be at least 2 characters").max(100),
        email: EmailSchema,
        designation: z.string().max(50).optional(),
        role: z.enum(["CO_OWNER", "DIRECTOR", "PARTNER"]),
    }),
    params: z.object({
        chainId: MongoIdSchema,
    }),
});

// ==================== Staff Schemas ====================

export const OnboardStaffSchema = z.object({
    body: z.object({
        phone: PhoneSchema,
        name: z.string().min(2, "Name must be at least 2 characters").max(100),
        email: EmailSchema,
        designation: z.enum(["FRONTDESK", "KITCHEN", "ROOM_SERVICE", "HOUSEKEEPING"]),
    }),
    params: z.object({
        hotelId: MongoIdSchema,
    }),
});

// ==================== Param Schemas ====================

export const ChainIdParamSchema = z.object({
    params: z.object({
        chainId: MongoIdSchema,
    }),
});

export const HotelIdParamSchema = z.object({
    params: z.object({
        hotelId: MongoIdSchema,
    }),
});

export const StaffIdParamSchema = z.object({
    params: z.object({
        hotelId: MongoIdSchema,
        staffId: MongoIdSchema,
    }),
});

// ==================== Query Schemas ====================

export const PaginationQuerySchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
        sortBy: z.string().optional(),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }),
});

export const ChainListQuerySchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
        isActive: z.coerce.boolean().optional(),
    }),
});

export const HotelListQuerySchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
        chainId: MongoIdSchema.optional(),
        city: z.string().optional(),
        isActive: z.coerce.boolean().optional(),
    }),
});

export const StaffListQuerySchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
        designation: z.enum(["MANAGER", "FRONTDESK", "KITCHEN", "ROOM_SERVICE", "HOUSEKEEPING"]).optional(),
        isActive: z.coerce.boolean().optional(),
    }),
});
