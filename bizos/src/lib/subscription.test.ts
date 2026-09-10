import { describe, it, expect } from "vitest";
import { assertWithinLimit, hasFeature, LimitError, planDef } from "@/lib/subscription";

describe("subscription limits", () => {
  it("blocks at the free-plan customer limit", () => {
    expect(() => assertWithinLimit("free", "customers", 5)).toThrow(LimitError);
    expect(() => assertWithinLimit("free", "customers", 4)).not.toThrow();
  });

  it("treats -1 as unlimited", () => {
    expect(() => assertWithinLimit("business", "customers", 10_000)).not.toThrow();
  });

  it("gates features by plan", () => {
    expect(hasFeature("free", "ai")).toBe(false);
    expect(hasFeature("pro", "ai")).toBe(true);
    expect(hasFeature("business", "team")).toBe(true);
  });

  it("falls back to free for an unknown plan", () => {
    expect(planDef("nope").key).toBe("free");
  });
});
