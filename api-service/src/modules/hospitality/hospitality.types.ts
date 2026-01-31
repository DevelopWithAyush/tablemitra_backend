// ==================== Interfaces ====================

export interface IChain {
    _id: string;
    name: string;
    description?: string;
    logo?: string;
    createdBy: string;
    settings: {
        currency: string;
        timezone: string;
        supportEmail?: string;
        supportPhone?: string;
        brandingColors?: {
            primary?: string;
            secondary?: string;
            accent?: string;
        };
    };
    subscription: {
        plan: "STARTER" | "GROWTH" | "ENTERPRISE";
        validTill?: Date;
        features: string[];
    };
    isActive: boolean;
    isDeleted: boolean;
}

export interface IHotel {
    _id: string;
    chainId: string;
    name: string;
    slug: string;
    description?: string;
    logo?: string;
    address: {
        street?: string;
        city: string;
        state: string;
        country: string;
        pincode: string;
        coordinates?: {
            lat?: number;
            lng?: number;
        };
    };
    contact: {
        phone: string;
        email: string;
        website?: string;
    };
    settings: {
        currency: string;
        timezone: string;
        checkInTime: string;
        checkOutTime: string;
    };
    panelSettings: {
        kitchenEnabled: boolean;
        roomServiceEnabled: boolean;
        kitchenOfflineRedirect: "FRONTDESK" | "ROOM_SERVICE";
    };
    totalRooms: number;
    isActive: boolean;
    isDeleted: boolean;
}

export interface IFounder {
    _id: string;
    userId: string;
    name?: string;
    email?: string;
    phone?: string;
    designation?: string;
    isActive: boolean;
    isDeleted: boolean;
}

export interface IHotelStaff {
    _id: string;
    userId: string;
    name: string;
    email?: string;
    employeeCode: string;
    currentHotelId: string;
    designation: string;
    isActive: boolean;
}

export interface IChainMembership {
    _id: string;
    founderId: string;
    chainId: string;
    role: "OWNER" | "CO_OWNER" | "DIRECTOR" | "PARTNER";
    isActive: boolean;
    joinedAt: Date;
}

// ==================== Service Results ====================

export interface ServiceSuccess<T = Record<string, unknown>> {
    success: true;
    data: T;
    message?: string;
}

export interface ServiceFailure {
    success: false;
    message: string;
}

export type ServiceResult<T = Record<string, unknown>> = ServiceSuccess<T> | ServiceFailure;

// ==================== Specific Results ====================

export interface OnboardChainResult {
    chainId: string;
    founderId: string;
    founderUserId: string;
    isNewFounder: boolean;
}

export interface OnboardHotelResult {
    hotelId: string;
    managerId: string;
    managerUserId: string;
    isNewManager: boolean;
    qrSetId?: string;
}

export interface AddMemberResult {
    founderId: string;
    membershipId: string;
    isNewFounder: boolean;
}

export interface OnboardStaffResult {
    staffId: string;
    userId: string;
    employeeCode: string;
    isNewUser: boolean;
}

// ==================== List Results ====================

export interface ChainListItem {
    _id: string;
    name: string;
    logo?: string;
    description?: string;
    hotelCount: number;
    founderCount: number;
    createdAt: Date;
}

export interface HotelListItem {
    _id: string;
    name: string;
    slug: string;
    logo?: string;
    chainId: string;
    chainName: string;
    city: string;
    state: string;
    managerName?: string;
    isActive: boolean;
    createdAt: Date;
}

export interface StaffListItem {
    _id: string;
    name: string;
    email?: string | null;
    employeeCode: string;
    designation: string;
    hotelId: string;
    hotelName: string;
    isActive: boolean;
    joinedAt: Date;
}

export interface ChainMemberListItem {
    _id: string;
    founderId: string;
    founderName: string;
    founderEmail?: string;
    founderPhone?: string;
    role: string;
    joinedAt: Date;
    isActive: boolean;
}
