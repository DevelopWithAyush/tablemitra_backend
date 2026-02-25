import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { OrderController } from "./order.controller.js";
import { PlaceOrderValidation, GetOrdersValidation } from "./order.validator.js";

const orderController = new OrderController();
const ordersRoutes = Router({ mergeParams: true });

ordersRoutes.use(authMiddleware);

ordersRoutes.post("/food", validate(PlaceOrderValidation), orderController.placeOrder);
ordersRoutes.get("/food", validate(GetOrdersValidation), orderController.getOrders);

export default ordersRoutes;
