import { readFile } from "fs/promises";
import path from "path";
import logger from "../../helpers/logger/index.js";
import CheckoutSessionModel from "./db/checkout-session.model.js";
import hospitalityService from "../hospitality/hospitality.service.js";
import { foodOrderService } from "../orders/food-order.service.js";
import { serviceRequestService } from "../orders/service-request.service.js";

function escapeHtml(s: string): string {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatDate(d: Date): string {
    return d.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function formatCurrency(n: number): string {
    return n.toFixed(2);
}

export async function generateCheckoutBillPdf(
    checkoutSessionId: string
): Promise<{ success: boolean; message?: string; data?: Buffer }> {
    const session = await CheckoutSessionModel.findById(checkoutSessionId).lean();
    if (!session) {
        return { success: false, message: "Checkout session not found" };
    }

    const hotelId = (session.hotelId as { toString(): string }).toString();
    const hotelRes = await hospitalityService.getHotelById(hotelId);
    if (!hotelRes.success || !hotelRes.data) {
        return { success: false, message: "Hotel not found" };
    }

    const hotel = hotelRes.data as {
        name?: string;
        logo?: { url?: string } | null;
        address?: { street?: string; city?: string; state?: string; country?: string; pincode?: string };
        contact?: { phone?: string; email?: string };
        businessDetails?: { gstin?: string; pan?: string; fssaiNumber?: string };
    };

    const addr = hotel.address ?? {};
    const addressParts = [addr.street, addr.city, addr.state, addr.country].filter(Boolean);
    const addressLine = addressParts.length > 0
        ? `${addressParts.join(", ")}${addr.pincode ? ` - ${addr.pincode}` : ""}`
        : (addr.pincode ?? "");
    const contactLine = [
        hotel.contact?.phone,
        hotel.contact?.email,
    ].filter(Boolean).join(" | ");

    const bd = hotel.businessDetails ?? {};
    const gstin = bd.gstin ?? "";
    const pan = bd.pan ?? "";
    const fssai = bd.fssaiNumber ?? "";

    const logoUrl = hotel.logo && typeof hotel.logo === "object" && typeof (hotel.logo as { url?: string }).url === "string"
        ? (hotel.logo as { url: string }).url
        : "";
    const headerLogo = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="Hotel Logo" class="logo" />`
        : "";

    const guestDetails = session.guestDetails as { name?: string; phone?: string } | undefined;
    const guestLine =
        guestDetails && (guestDetails.name || guestDetails.phone)
            ? `<div><strong>Guest:</strong> ${escapeHtml(guestDetails.name ?? "")} ${guestDetails.phone ? `| ${escapeHtml(guestDetails.phone)}` : ""}</div>`
            : "";

    const foodOrderIds = (session.foodOrderIds ?? []) as unknown[];
    const serviceRequestIds = (session.serviceRequestIds ?? []) as unknown[];
    const [foodOrders, serviceRequests] = await Promise.all([
        foodOrderService.getFoodOrdersByIdsForBill(foodOrderIds.map((id) => (id as { toString(): string }).toString())),
        serviceRequestService.getServiceRequestsByIdsForBill(serviceRequestIds.map((id) => (id as { toString(): string }).toString())),
    ]);

    let foodOrdersHtml = "";
    if (foodOrders.length > 0) {
        const rows: string[] = [];
        for (const order of foodOrders) {
            const items = (order.items ?? []) as Array<{ itemName?: string; variantName?: string; quantity?: number; price?: number }>;
            for (const it of items) {
                const name = it.variantName ? `${it.itemName ?? ""} (${it.variantName})` : (it.itemName ?? "");
                const qty = it.quantity ?? 1;
                const price = it.price ?? 0;
                const lineTotal = (price * qty).toFixed(2);
                rows.push(
                    `<tr><td>${escapeHtml(name)}</td><td class="text-right">${qty}</td><td class="text-right">₹ ${formatCurrency(price)}</td><td class="text-right">₹ ${lineTotal}</td></tr>`
                );
            }
        }
        foodOrdersHtml = `
            <div class="section">
                <div class="section-title">Food Orders</div>
                <table>
                    <thead><tr><th>Item</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Amount</th></tr></thead>
                    <tbody>${rows.join("")}</tbody>
                </table>
            </div>`;
    }

    let serviceRequestsHtml = "";
    if (serviceRequests.length > 0) {
        const rows: string[] = [];
        for (const req of serviceRequests) {
            const items = (req.items ?? []) as Array<{ itemName?: string; quantity?: number; price?: number }>;
            for (const it of items) {
                const name = it.itemName ?? "";
                const qty = it.quantity ?? 1;
                const price = it.price ?? 0;
                const lineTotal = (price * qty).toFixed(2);
                rows.push(
                    `<tr><td>${escapeHtml(name)}</td><td class="text-right">${qty}</td><td class="text-right">₹ ${formatCurrency(price)}</td><td class="text-right">₹ ${lineTotal}</td></tr>`
                );
            }
        }
        serviceRequestsHtml = `
            <div class="section">
                <div class="section-title">Service Requests</div>
                <table>
                    <thead><tr><th>Item</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Amount</th></tr></thead>
                    <tbody>${rows.join("")}</tbody>
                </table>
            </div>`;
    }

    const adjustments = (session.adjustments ?? []) as Array<{ type: string; amount: number; label?: string }>;
    let adjustmentsSection = "";
    const adjustmentRows: string[] = [];
    if (adjustments.length > 0) {
        for (const a of adjustments) {
            const label = a.label || a.type;
            const amt = a.amount;
            const sign = a.type === "DISCOUNT" ? "-" : "+";
            adjustmentRows.push(
                `<div class="total-row"><span>${escapeHtml(label)}</span><span>${sign} ₹ ${formatCurrency(Math.abs(amt))}</span></div>`
            );
        }
        adjustmentsSection = `
            <div class="section">
                <div class="section-title">Adjustments</div>
                <table>
                    <thead><tr><th>Type</th><th class="text-right">Amount</th></tr></thead>
                    <tbody>${adjustments.map((a) => `<tr><td>${escapeHtml(a.label || a.type)}</td><td class="text-right">${a.type === "DISCOUNT" ? "-" : ""}₹ ${formatCurrency(Math.abs(a.amount))}</td></tr>`).join("")}</tbody>
                </table>
            </div>`;
    }

    const adjustmentsRowsHtml = adjustmentRows.join("");

    const paidAt = session.paidAt ? new Date(session.paidAt as Date) : new Date();

    const templatePath = path.join(process.cwd(), "src", "template", "checkout-bill.html");
    let html = await readFile(templatePath, "utf-8");
    html = html
        .replace("{{HEADER_LOGO}}", headerLogo)
        .replace("{{HOTEL_NAME}}", escapeHtml(hotel.name ?? "Hotel"))
        .replace("{{HOTEL_ADDRESS}}", escapeHtml(addressLine))
        .replace("{{HOTEL_CONTACT}}", escapeHtml(contactLine))
        .replace("{{GSTIN}}", escapeHtml(gstin))
        .replace("{{PAN}}", escapeHtml(pan))
        .replace("{{FSSAI}}", escapeHtml(fssai))
        .replace("{{ROOM_NUMBER}}", escapeHtml((session.roomNumber as string) ?? ""))
        .replace("{{CHECKOUT_DATE}}", formatDate(paidAt))
        .replace("{{GUEST_DETAILS}}", guestLine)
        .replace("{{FOOD_ORDERS_SECTION}}", foodOrdersHtml)
        .replace("{{SERVICE_REQUESTS_SECTION}}", serviceRequestsHtml)
        .replace("{{ADJUSTMENTS_SECTION}}", adjustmentsSection)
        .replace("{{ORDERS_SUBTOTAL}}", formatCurrency(session.ordersSubtotal as number))
        .replace("{{ADJUSTMENTS_ROWS}}", adjustmentsRowsHtml)
        .replace("{{FINAL_AMOUNT}}", formatCurrency(session.finalAmount as number));

    try {
        const puppeteer = await import("puppeteer-core");
        const systemChrome = process.env.PUPPETEER_EXECUTABLE_PATH;
        const launchOpts: Parameters<typeof puppeteer.default.launch>[0] = {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        };
        if (systemChrome) {
            launchOpts.executablePath = systemChrome;
        } else {
            const chromium = (await import("@sparticuz/chromium")).default;
            launchOpts.executablePath = await chromium.executablePath();
            launchOpts.args = chromium.args;
            launchOpts.defaultViewport = chromium.defaultViewport;
            launchOpts.headless = chromium.headless;
        }
        const browser = await puppeteer.default.launch(launchOpts);
        try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: "networkidle0" });
            const pdfBuffer = await page.pdf({
                format: "A4",
                printBackground: true,
                margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
            });
            return { success: true, data: Buffer.from(pdfBuffer) };
        } finally {
            await browser.close();
        }
    } catch (error: unknown) {
        logger.error("Checkout bill PDF generation failed", { error: (error as Error)?.message });
        return { success: false, message: (error as Error)?.message ?? "Failed to generate PDF" };
    }
}
