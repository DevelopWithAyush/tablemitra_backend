export const SOCKET_EVENTS = {
    FOOD_ORDER_ALERT: "food.order.alert",
    FOOD_ORDER_CREATED: "food.order.created",
    FOOD_ORDER_ACCEPTED: "food.order.accepted",
    FOOD_ORDER_REJECTED: "food.order.rejected",
    FOOD_ORDER_PREPARING: "food.order.preparing",
    FOOD_ORDER_READY: "food.order.ready",
    FOOD_ORDER_SERVED: "food.order.served",
    FOOD_ORDER_CANCELLED: "food.order.cancelled",
    FOOD_ORDER_EDITED: "food.order.edited", 

    SERVICE_REQUEST_CREATED: "service.request.created",
    SERVICE_REQUEST_ACCEPTED: "service.request.accepted",
    SERVICE_REQUEST_REJECTED: "service.request.rejected",

    MENU_ITEM_CLOSED: "menu.item.closed",
    MENU_ITEM_OPENED: "menu.item.opened",

    /**
     * Emitted to hotel:{hotelId} when the FIRST socket in a department room connects.
     * Payload: { department: HotelDepartment; hotelId: string }
     */
    PANEL_ONLINE: "panel.online",
    /**
     * Emitted to hotel:{hotelId} when the LAST socket in a department room disconnects.
     * Payload: { department: HotelDepartment; hotelId: string }
     */
    PANEL_OFFLINE: "panel.offline",
};