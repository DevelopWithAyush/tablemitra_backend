export type AuditAction =
    | "ORDER_CREATED"
    | "ORDER_ACCEPTED"
    | "ORDER_REJECTED"
    | "ORDER_PREPARING"
    | "ORDER_READY"
    | "ORDER_SERVED"
    | "ORDER_CANCELLED"
    | "ORDER_EDITED"
    | "SERVICE_REQUEST_CREATED"
    | "SERVICE_REQUEST_ACCEPTED"
    | "SERVICE_REQUEST_REJECTED"
    | "SERVICE_REQUEST_ASSIGNED"
    | "SERVICE_REQUEST_STARTED"
    | "SERVICE_REQUEST_COMPLETED"
    | "SERVICE_REQUEST_CANCELLED"
    | "SERVICE_REQUEST_EDITED"
    | "USER_LOGIN"
    | "USER_LOGOUT"
    | "USER_PROFILE_UPDATED"
    | "USER_PASSWORD_CHANGED"
    | "USER_BLOCKED"
    | "USER_UNBLOCKED"
    | "USER_DELETED"
    | "STAFF_CREATED"
    | "STAFF_UPDATED"
    | "STAFF_DELETED"
    | "STAFF_ROLE_CHANGED"
    | "STAFF_PERMISSIONS_UPDATED"
    | "MENU_ITEM_CREATED"
    | "MENU_ITEM_UPDATED"
    | "MENU_ITEM_DELETED"
    | "MENU_ITEM_AVAILABILITY_CHANGED"
    | "MENU_CATEGORY_CREATED"
    | "MENU_CATEGORY_UPDATED"
    | "MENU_CATEGORY_DELETED"
    | "SERVICE_ITEM_CREATED"
    | "SERVICE_ITEM_UPDATED"
    | "SERVICE_ITEM_DELETED"
    | "SERVICE_ITEM_AVAILABILITY_CHANGED"
    | "SERVICE_CATEGORY_CREATED"
    | "SERVICE_CATEGORY_UPDATED"
    | "SERVICE_CATEGORY_DELETED"
    | "HOTEL_CREATED"
    | "HOTEL_UPDATED"
    | "HOTEL_SETTINGS_CHANGED"
    | "HOTEL_PANEL_SETTINGS_CHANGED"
    | "CHAIN_CREATED"
    | "CHAIN_UPDATED"
    | "CHAIN_SUBSCRIPTION_CHANGED"
    | "GUEST_CHECKED_IN"
    | "GUEST_CHECKED_OUT"
    | "GUEST_SESSION_TRANSFERRED";

export type EntityType =
    | "FOOD_ORDER"
    | "SERVICE_REQUEST"
    | "USER"
    | "CUSTOMER"
    | "STAFF"
    | "MENU_ITEM"
    | "MENU_CATEGORY"
    | "SERVICE_ITEM"
    | "SERVICE_CATEGORY"
    | "HOTEL"
    | "CHAIN"
    | "GUEST_SESSION"
    | "FOUNDER"
    | "ADMIN"
    | "CUSTOMER_CARE"
    | "SALES";

export type ActorRole =
    | "CUSTOMER"
    | "ADMIN"
    | "FOUNDER"
    | "MANAGER"
    | "FRONTDESK_STAFF"
    | "KITCHEN_STAFF"
    | "ROOM_SERVICE_STAFF"
    | "CUSTOMER_CARE"
    | "SALES"
    | "SYSTEM";

export interface AuditEventActor {
    userId: string;
    role: ActorRole;
    name?: string;
    email?: string;
}

export interface AuditEventContext {
    hotelId?: string;
    chainId?: string;
    sessionId?: string;
    ip?: string;
    userAgent?: string;
    panel?: string;
}

export interface AuditEventPayload {
    action: AuditAction;
    entityType: EntityType;
    entityId: string;
    actor: AuditEventActor;
    context?: AuditEventContext;
    previousData?: Record<string, unknown>;
    newData?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    timestamp: Date;
}

export const AUDIT_QUEUE = "audit.logs";
export const AUDIT_EXCHANGE = "audit.exchange";

export const RETENTION_DAYS = 3 * 365; // 3 years
