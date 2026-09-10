import { describe, it, expect, beforeAll, vi } from "vitest";

// Mock NextAuth so getTenant() resolves whichever user we "log in" as.
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => {
    const { mockAuth } = await import("@/test/harness");
    return mockAuth.userId ? { user: { id: mockAuth.userId } } : null;
  }),
}));

import { seedTwoOrgs, loginAs, jsonRequest, type SeededOrg } from "@/test/harness";
import { GET as customersGET, POST as customersPOST } from "@/app/api/customers/route";
import { PATCH as customerPATCH, DELETE as customerDELETE } from "@/app/api/customers/[id]/route";
import { PATCH as settingsPATCH } from "@/app/api/settings/route";

let a: SeededOrg;
let b: SeededOrg;

beforeAll(async () => {
  ({ a, b } = await seedTwoOrgs());
});

describe("multi-tenant isolation (§34.23 / Flow 6)", () => {
  it("only returns the caller's own customers", async () => {
    loginAs(a.ownerId);
    const res = await customersGET(jsonRequest("/api/customers", "GET"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.customers.every((c: { organizationId: string }) => c.organizationId === a.orgId)).toBe(true);
    expect(data.customers.some((c: { id: string }) => c.id === b.customerId)).toBe(false);
  });

  it("blocks reading/patching another org's customer (404, no data leak)", async () => {
    loginAs(b.ownerId);
    const patch = await customerPATCH(jsonRequest(`/api/customers/${a.customerId}`, "PATCH", { name: "hacked" }), {
      params: { id: a.customerId },
    });
    expect(patch.status).toBe(404);

    const del = await customerDELETE(jsonRequest(`/api/customers/${a.customerId}`, "DELETE"), {
      params: { id: a.customerId },
    });
    expect(del.status).toBe(404);
  });

  it("rejects unauthenticated access (401)", async () => {
    loginAs(null);
    const res = await customersGET(jsonRequest("/api/customers", "GET"));
    expect(res.status).toBe(401);
  });
});

describe("permissions (§34.14 / §34.24)", () => {
  it("allows an owner to write customers", async () => {
    loginAs(a.ownerId);
    const res = await customersPOST(jsonRequest("/api/customers", "POST", { name: "New Person" }));
    expect(res.status).toBe(200);
  });

  it("forbids an EMPLOYEE from changing settings (403)", async () => {
    loginAs(a.employeeUserId);
    const res = await settingsPATCH(jsonRequest("/api/settings", "PATCH", { name: "x" }));
    expect(res.status).toBe(403);
  });

  it("rejects invalid input (422)", async () => {
    loginAs(a.ownerId);
    const res = await customersPOST(jsonRequest("/api/customers", "POST", { name: "" }));
    expect(res.status).toBe(422);
  });
});
