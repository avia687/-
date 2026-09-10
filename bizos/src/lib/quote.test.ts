import { describe, it, expect } from "vitest";
import { calcQuote } from "@/lib/quote";

describe("calcQuote", () => {
  it("adds tax on top when not tax-included", () => {
    const t = calcQuote({ items: [{ quantity: 2, unitPrice: 100 }], discount: 0, taxRate: 0.17, taxIncluded: false });
    expect(t.subtotal).toBe(200);
    expect(t.taxAmount).toBe(34);
    expect(t.total).toBe(234);
  });

  it("applies discount before tax", () => {
    const t = calcQuote({ items: [{ quantity: 1, unitPrice: 500 }], discount: 100, taxRate: 0.17, taxIncluded: false });
    expect(t.subtotal).toBe(400);
    expect(t.total).toBe(468);
  });

  it("extracts tax from a tax-included price", () => {
    const t = calcQuote({ items: [{ quantity: 1, unitPrice: 117 }], discount: 0, taxRate: 0.17, taxIncluded: true });
    expect(t.total).toBe(117);
    expect(t.subtotal).toBe(100);
    expect(t.taxAmount).toBe(17);
  });

  it("never goes negative when discount exceeds gross", () => {
    const t = calcQuote({ items: [{ quantity: 1, unitPrice: 50 }], discount: 200, taxRate: 0.17, taxIncluded: false });
    expect(t.subtotal).toBe(0);
    expect(t.total).toBe(0);
  });
});
