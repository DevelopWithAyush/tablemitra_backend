import { Router } from "express";
import authController from "./auth.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import { SendOtpSchema, VerifyOtpSchema, SwitchChainSchema, UpdateCustomerProfileSchema } from "./validator/auth.validator.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";

// mergeParams: true to inherit :app from parent route
const authRoutes = Router({ mergeParams: true });

// Public routes
authRoutes.post("/send-otp", validate(SendOtpSchema), authController.sendOtp);
authRoutes.post("/verify-otp", validate(VerifyOtpSchema), authController.verifyOtp);
authRoutes.post("/refresh-token", authController.refreshToken);

// Protected routes
authRoutes.use(authMiddleware);
authRoutes.get("/me", authController.getMe);
authRoutes.post("/logout", authController.logout);

// Founder-specific routes for chain context
authRoutes.get("/chains",requirePermissions("VIEW_CHAIN"), authController.getChains);
authRoutes.post("/switch-chain", requirePermissions("SWITCH_CHAIN"), validate(SwitchChainSchema), authController.switchChain);   


authRoutes.put("/update-customer-profile", requirePermissions("UPDATE_CUSTOMER_PROFILE"), validate(UpdateCustomerProfileSchema), authController.updateCustomerProfile);

export default authRoutes;