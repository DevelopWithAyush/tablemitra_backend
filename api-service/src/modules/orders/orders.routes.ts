import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";
import { OrderController } from "./food-order.controller.js";
import { PlaceOrderValidation, GetOrdersValidation, UpdateOrderStatusValidation } from "./food-order.validator.js";
import { ServiceRequestController } from "./service-request.controller.js";
import {
    PlaceServiceRequestValidation,
    GetServiceRequestsValidation,
    UpdateServiceRequestStatusValidation,
} from "./service-request.validator.js";
import { ActiveOrdersController } from "./active-orders.controller.js";

const orderController = new OrderController();
const serviceRequestController = new ServiceRequestController();
const activeOrdersController = new ActiveOrdersController();
const ordersRoutes = Router({ mergeParams: true });

ordersRoutes.use(authMiddleware);

// ── Active orders (bottom bar + status pages) — registered first to avoid
//   conflicts with future /food/:orderId or /service/:requestId routes ────────
ordersRoutes.get("/active", activeOrdersController.getActiveSummary);
ordersRoutes.get("/food/active", activeOrdersController.getActiveFoodOrders);
ordersRoutes.get("/service/active", activeOrdersController.getActiveServiceRequests);

// ── Food orders ───────────────────────────────────────────────────────────────
ordersRoutes.post("/food", requirePermissions("CREATE_FOOD_ORDER"), validate(PlaceOrderValidation), orderController.placeOrder);
ordersRoutes.get("/food", requirePermissions("VIEW_FOOD_ORDER"), validate(GetOrdersValidation), orderController.getOrders);
ordersRoutes.patch(
    "/food/:orderId/status",
    requirePermissions("UPDATE_FOOD_ORDER_STATUS"),
    validate(UpdateOrderStatusValidation),
    orderController.updateOrderStatus
);

// ── Service requests (laundry, housekeeping, amenities, etc.) ─────────────────
ordersRoutes.post(
    "/service",
    requirePermissions("CREATE_SERVICE_REQUEST"),
    validate(PlaceServiceRequestValidation),
    serviceRequestController.placeServiceRequest
);
ordersRoutes.get(
    "/service",
    requirePermissions("VIEW_SERVICE_REQUEST"),
    validate(GetServiceRequestsValidation),
    serviceRequestController.getServiceRequests
);
ordersRoutes.patch(
    "/service/:requestId/status",
    requirePermissions("UPDATE_SERVICE_REQUEST_STATUS"),
    validate(UpdateServiceRequestStatusValidation),
    serviceRequestController.updateServiceRequestStatus
);

export default ordersRoutes;
