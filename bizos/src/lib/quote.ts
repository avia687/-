// Quote totals — single source of truth used by the API and the public page.
export type QuoteCalcInput = {
  items: { quantity: number; unitPrice: number }[];
  discount: number; // absolute amount
  taxRate: number; // e.g. 0.17
  taxIncluded: boolean;
};

export type QuoteTotals = { subtotal: number; taxAmount: number; total: number };

export function calcQuote({ items, discount, taxRate, taxIncluded }: QuoteCalcInput): QuoteTotals {
  const gross = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  const afterDiscount = Math.max(0, gross - discount);
  if (taxIncluded) {
    // Price already includes tax — extract the tax portion for display.
    const taxAmount = afterDiscount - afterDiscount / (1 + taxRate);
    return round({ subtotal: afterDiscount - taxAmount, taxAmount, total: afterDiscount });
  }
  const taxAmount = afterDiscount * taxRate;
  return round({ subtotal: afterDiscount, taxAmount, total: afterDiscount + taxAmount });
}

function round(t: QuoteTotals): QuoteTotals {
  const r = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return { subtotal: r(t.subtotal), taxAmount: r(t.taxAmount), total: r(t.total) };
}
