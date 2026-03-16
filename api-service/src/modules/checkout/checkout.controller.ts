import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendServiceError } from "../../utils/error-response.js";
import { checkoutService } from "./checkout.service.js";
import { generateCheckoutBillPdf } from "./checkout-pdf.service.js";
import type { IJwtPayload } from "../auth/auth.types.js";

export class CheckoutController {
    getCheckoutPreview = asyncHandler(async (req: Request, res: Response) => {
        const { roomSessionId, checkoutSessionId } = req.query as {
            roomSessionId?: string;
            checkoutSessionId?: string;
        };
        const result = await checkoutService.getCheckoutPreview({ roomSessionId, checkoutSessionId });

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(200).json({ success: true, data: result.data });
    });

    getCheckoutHistory = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const hotelId = user.ctx?.type === "HOTEL" ? user.ctx.id : undefined;
        if (!hotelId) {
            return sendServiceError(res, 403, "Hotel context required", { instance: req.originalUrl });
        }

        const { search, page, limit } = req.query as { search?: string; page?: string; limit?: string };
        const result = await checkoutService.getCheckoutHistory(hotelId, {
            search,
            page: page ? parseInt(page, 10) : 1,
            limit: limit ? parseInt(limit, 10) : 20,
        });

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(200).json({ success: true, ...result.data });
    });

    proceedCheckout = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const { roomSessionId, adjustments, paymentMethod, guestDetails } = req.body;

        const result = await checkoutService.proceedCheckout(
            { roomSessionId, adjustments, paymentMethod, guestDetails },
            user.sub
        );

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(200).json({
            success: true,
            message: "Checkout completed successfully",
            data: result.data,
        });
    });

    getCheckoutBillPdf = asyncHandler(async (req: Request, res: Response) => {
        const { roomSessionId } = req.query as { roomSessionId: string };
        const result = await generateCheckoutBillPdf(roomSessionId);

        if (!result.success) {
            return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
        }

        const filename = `checkout-bill-${roomSessionId}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(result.data);
    });
}
