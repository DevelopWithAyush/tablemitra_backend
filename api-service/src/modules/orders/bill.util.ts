/**
 * Bill calculation utilities for orders.
 * All monetary values rounded to 2 decimal places. No service charge (hotel industry).
 */

export const roundTo2 = (n: number): number => Math.round(n * 100) / 100;

export interface BillBreakdown {
    subtotal: number;
    serviceCharge: number;
    gstAndOther: number;
    toPay: number;
}

/** Line item with price and tax rates (from item.taxes). */
export interface TaxableLine {
    price: number;
    discountedPrice?: number;
    quantity: number;
    taxes: Array<{ name: string; rate: number }>;
}

/**
 * Compute bill from taxable lines (price exclusive of tax).
 * serviceCharge is always 0. gstAndOther = sum of (lineTotal * sum(rate)/100) per line.
 */
export function computeBillFromTaxableLines(lines: TaxableLine[]): BillBreakdown {
    let subtotal = 0;
    let gstAndOther = 0;

    for (const line of lines) {
        const unitPrice = line.discountedPrice ?? line.price;
        const lineTotal = roundTo2(unitPrice * line.quantity);
        subtotal = roundTo2(subtotal + lineTotal);

        const totalRate = (line.taxes ?? []).reduce((sum, t) => sum + t.rate, 0);
        const lineTax = roundTo2((lineTotal * totalRate) / 100);
        gstAndOther = roundTo2(gstAndOther + lineTax);
    }

    const serviceCharge = 0;
    const toPay = roundTo2(subtotal + serviceCharge + gstAndOther);

    return {
        subtotal,
        serviceCharge,
        gstAndOther,
        toPay,
    };
}
