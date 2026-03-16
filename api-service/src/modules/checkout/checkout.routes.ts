import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";
import { CheckoutController } from "./checkout.controller.js";
import {
    GetCheckoutPreviewSchema,
    ProceedCheckoutSchema,
    GetCheckoutBillPdfSchema,
    GetCheckoutHistorySchema,
} from "./checkout.validator.js";

const checkoutController = new CheckoutController();
const checkoutRoutes = Router({ mergeParams: true });

checkoutRoutes.use(authMiddleware);

// Frontdesk: Get checkout preview for a room (orders + service requests + subtotal)
checkoutRoutes.get(
    "/preview",
    requirePermissions(["CHECK_IN_GUEST"], "all", true),
    validate(GetCheckoutPreviewSchema),
    checkoutController.getCheckoutPreview
);

// Frontdesk: Get checkout history (past checked-out sessions) – hotel scoped, smart search
checkoutRoutes.get(
    "/history",
    requirePermissions(["CHECK_IN_GUEST"], "all", true),
    validate(GetCheckoutHistorySchema),
    checkoutController.getCheckoutHistory
);

// Frontdesk: Proceed checkout (apply adjustments, record payment, check out)
checkoutRoutes.post(
    "/proceed",
    requirePermissions(["CHECK_IN_GUEST"], "all", true),
    validate(ProceedCheckoutSchema),
    checkoutController.proceedCheckout
);

// Frontdesk: Download checkout bill PDF (by roomSessionId)
checkoutRoutes.get(
    "/bill-pdf",
    requirePermissions(["CHECK_IN_GUEST"], "all", true),
    validate(GetCheckoutBillPdfSchema),
    checkoutController.getCheckoutBillPdf
);

export default checkoutRoutes;
