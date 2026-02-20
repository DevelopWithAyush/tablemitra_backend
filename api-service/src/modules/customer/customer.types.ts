/** Hotel context for customer app home (after room scan). */
export interface CustomerHotelContext {
    roomNumber: string;
    name: string;
    logo: string | null;
    /** Full address as single-line string */
    address: string;
    phone: string;
    currency: string;
    timezone: string;
    taxSettings: Array<{
        taxRate: number;
        taxType: string;
        taxCode?: string;
        name?: string;
    }>;
}

/** Response when customer has no hotel context (needs to scan QR). */
export interface CustomerHomeRequiresScan {
    requiresScan: true;
    message: string;
    data: null;
}

/** Response when customer has hotel context. */
export interface CustomerHomeWithContext {
    requiresScan: false;
    message?: string;
    data: CustomerHotelContext;
}

export type CustomerHomeResponse = CustomerHomeRequiresScan | CustomerHomeWithContext;
