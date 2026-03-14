import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendServiceError } from "../../utils/error-response.js";
import { checkoutService } from "./checkout.service.js";
import { generateCheckoutBillPdf } from "./checkout-pdf.service.js";
import type { IJwtPayload } from "../auth/auth.types.js";

export class CheckoutController {
    getCheckoutPreview = asyncHandler(async (req: Request, res: Response) => {
        const { roomSessionId } = req.query as { roomSessionId: string };
        const result = await checkoutService.getCheckoutPreview(roomSessionId);

        if (!result.success) {
            return sendServiceError(res, 400, result.message ?? "Bad request", { instance: req.originalUrl });
        }

        return res.status(200).json({ success: true, data: result.data });
    });

    proceedCheckout = asyncHandler(async (req: Request, res: Response) => {
        const user = (req as any).user as IJwtPayload;
        const { hotelId, roomNumber, adjustments, paymentMethod, guestDetails } = req.body;

        const result = await checkoutService.proceedCheckout(
            { hotelId, roomNumber, adjustments, paymentMethod, guestDetails },
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
        const { checkoutSessionId } = req.params as { checkoutSessionId: string };
        const result = await generateCheckoutBillPdf(checkoutSessionId);

        if (!result.success) {
            return sendServiceError(res, 404, result.message ?? "Not found", { instance: req.originalUrl });
        }

        const filename = `checkout-bill-${checkoutSessionId}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(result.data);
    });
}
