import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requirePermissions } from "../../middleware/permission.middleware.js";
import {
    requestUpload,
    confirmUpload,
    getAttachmentById,
} from "./attach.controller.js";

const attachmentRoutes = Router({ mergeParams: true });

attachmentRoutes.use(authMiddleware);

attachmentRoutes.post(
    "/request-upload",
    requirePermissions("CREATE_ATTACHMENT"),
    requestUpload
);

attachmentRoutes.post(
    "/confirm-upload",
    requirePermissions("CREATE_ATTACHMENT"),
    confirmUpload
);

attachmentRoutes.get(
    "/:attachmentId",
    requirePermissions("VIEW_ATTACHMENT"),
    getAttachmentById
);

export default attachmentRoutes;