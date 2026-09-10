import { describe, it, expect } from "vitest";
import { can, atLeast } from "@/lib/rbac";

describe("rbac", () => {
  it("grants higher roles the permissions of lower ones", () => {
    expect(can("OWNER", "settings:write")).toBe(true);
    expect(can("ADMIN", "settings:write")).toBe(true);
    expect(can("EMPLOYEE", "customers:read")).toBe(true);
  });

  it("denies under-privileged roles", () => {
    expect(can("EMPLOYEE", "settings:write")).toBe(false);
    expect(can("EMPLOYEE", "payments:read")).toBe(false);
    expect(can("MANAGER", "employees:write")).toBe(false);
  });

  it("atLeast compares rank correctly", () => {
    expect(atLeast("ADMIN", "MANAGER")).toBe(true);
    expect(atLeast("EMPLOYEE", "MANAGER")).toBe(false);
  });
});
