import { describe, it, expect } from "vitest";
import { resolveConfig } from "@/lib/business/resolve";

describe("resolveConfig", () => {
  it("uses the template terminology for a known business type", () => {
    const cfg = resolveConfig({ businessType: "plumber" });
    expect(cfg.terminology.job).toBe("קריאת שירות");
    expect(cfg.terminology.employee).toBe("טכנאי");
  });

  it("falls back to generic for an unknown type", () => {
    const cfg = resolveConfig({ businessType: "does-not-exist" });
    expect(cfg.type).toBe("generic");
    expect(cfg.terminology.customer).toBe("לקוח");
  });

  it("layers tenant terminology overrides on top of the template", () => {
    const cfg = resolveConfig({
      businessType: "plumber",
      terminologyOverrides: JSON.stringify({ customer: "מטופל" }),
    });
    expect(cfg.terminology.customer).toBe("מטופל"); // override
    expect(cfg.terminology.job).toBe("קריאת שירות"); // template retained
  });

  it("prefers tenant AI instructions when present", () => {
    const cfg = resolveConfig({ businessType: "barber", aiInstructions: "custom" });
    expect(cfg.aiInstructions).toBe("custom");
  });
});
