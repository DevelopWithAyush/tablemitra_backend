import { Router } from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import adminRoutes from "./modules/auth/admin/admin.routes.js";
import companyRoutes from "./modules/company/company.routes.js";
import hospitalityRoutes from "./modules/hospitality/hospitality.routes.js";
import qrCodeRoutes from "./modules/qr-code/qr-code.routes.js";
import attachmentRoutes from "./modules/attachments/attach.routes.js";
import menuRoutes from "./modules/menu/menu.routes.js";
import serviceRoutes from "./modules/service/service.routes.js";
import { handleCustomerScan } from "./modules/customer/customer.controller.js";

// mergeParams: true to inherit :app from parent route
const router = Router({ mergeParams: true });

// Customer scan (ROOM QR): redirect flow, only for app=customer. Must be before /auth so /scan/:code is exact.
router.get("/scan/:code", handleCustomerScan);

// Auth routes
router.use("/auth", authRoutes);

// Admin routes (role/permission management)
router.use("/admin", adminRoutes);

// Company routes (SaaS staff: admin, customer care, sales)
router.use("/company", companyRoutes);

// Hospitality routes (chains, hotels, founders, staff)
router.use("/hospitality", hospitalityRoutes);

// QR Code routes
router.use("/qr-codes", qrCodeRoutes);

// Attachment routes
router.use("/attachments", attachmentRoutes);

// Menu routes (categories, items, variants)
router.use("/menu", menuRoutes);

// Service optimization routes (service categories, services)
router.use("/service", serviceRoutes);

export default router;
