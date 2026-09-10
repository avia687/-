import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => {
    const { mockAuth } = await import("@/test/harness");
    return mockAuth.userId ? { user: { id: mockAuth.userId } } : null;
  }),
}));

import { seedTwoOrgs, loginAs, jsonRequest, type SeededOrg } from "@/test/harness";
import { prisma } from "@/lib/db";
import { POST as quotesPOST } from "@/app/api/quotes/route";
import { POST as publicQuotePOST } from "@/app/api/public/quote/[token]/route";
import { getAI } from "@/lib/ai";
import { buildSnapshot } from "@/lib/ai/snapshot";
import { dispatch } from "@/lib/automations/engine";

let a: SeededOrg;

beforeAll(async () => {
  ({ a } = await seedTwoOrgs());
});

describe("quote flow (§34.9)", () => {
  it("computes + persists totals and approves via public token", async () => {
    loginAs(a.ownerId);
    const res = await quotesPOST(
      jsonRequest("/api/quotes", "POST", {
        customerId: a.customerId,
        items: [{ serviceId: a.serviceId, name: "svc", quantity: 2, unitPrice: 300 }],
        discount: 0,
        taxRate: 0.17,
        taxIncluded: false,
        status: "sent",
      }),
    );
    const { quote } = await res.json();
    expect(res.status).toBe(200);
    expect(quote.subtotal).toBe(600);
    expect(quote.total).toBe(702);

    // Customer approves without auth, gated only by the token.
    loginAs(null);
    const approve = await publicQuotePOST(
      jsonRequest(`/api/public/quote/${quote.publicToken}`, "POST", { action: "approve" }),
      { params: { token: quote.publicToken } },
    );
    expect(approve.status).toBe(200);
    const fresh = await prisma.quote.findUnique({ where: { id: quote.id } });
    expect(fresh?.status).toBe("approved");
  });
});

describe("AI grounding (§34.18/§34.19)", () => {
  it("proposes a quote action only for a real customer, never invents", async () => {
    const snapshot = await buildSnapshot(a.orgId);
    const ok = await getAI().proposeAction("תיצור הצעת מחיר ל orga-cust", snapshot);
    expect(ok.type).toBe("create_quote");

    const missing = await getAI().proposeAction("תיצור הצעת מחיר ללקוח שלא קיים בכלל", snapshot);
    expect(missing.type).toBe("none");
  });
});

describe("automation dedupe (§34.16)", () => {
  it("never double-sends on retry with the same dedupeKey", async () => {
    await prisma.automation.upsert({
      where: { organizationId_key: { organizationId: a.orgId, key: "thank_you" } },
      update: { enabled: true },
      create: { organizationId: a.orgId, key: "thank_you", enabled: true },
    });
    const ctx = { dedupeKey: "job_completed:X", customerName: "orga-cust" };
    await dispatch(a.orgId, "job_completed", ctx);
    await dispatch(a.orgId, "job_completed", ctx); // retry

    const runs = await prisma.automationRun.count({
      where: { organizationId: a.orgId, dedupeKey: "thank_you:job_completed:X" },
    });
    expect(runs).toBe(1);
  });
});
