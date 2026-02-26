import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";
import { OrderController } from "./order.controller.js";
import { PlaceOrderValidation, GetOrdersValidation, UpdateOrderStatusValidation } from "./order.validator.js";

const orderController = new OrderController();
const ordersRoutes = Router({ mergeParams: true });

ordersRoutes.use(authMiddleware);

ordersRoutes.post("/food", validate(PlaceOrderValidation), orderController.placeOrder);
ordersRoutes.get("/food", validate(GetOrdersValidation), orderController.getOrders);
ordersRoutes.patch(
    "/food/:orderId/status",
    requirePermissions(["UPDATE_ORDER"], "any", true),
    validate(UpdateOrderStatusValidation),
    orderController.updateOrderStatus
);

export default ordersRoutes;
