import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { audit } from "@/lib/audit";

// Lists automations for the tenant with their recent execution log, and
// toggles enable/disable. Automations are created lazily so every known key
// appears even before it has been touched.
const KNOWN_KEYS = ["job_confirmation", "reminder_24h", "thank_you", "review_request", "quote_followup", "payment_reminder"];

export async function GET() {
  try {
    const tenant = await requirePermission("settings:read");
    const org = tenant.organizationId;

    // Ensure a row exists for every known key (idempotent).
    for (const key of KNOWN_KEYS) {
      await prisma.automation.upsert({
        where: { organizationId_key: { organizationId: org, key } },
        update: {},
        create: { organizationId: org, key, enabled: false },
      });
    }

    const automations = await prisma.automation.findMany({
      where: { organizationId: org },
      orderBy: { key: "asc" },
    });
    const runs = await prisma.automationRun.findMany({
      where: { organizationId: org },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ automations, runs });
  } catch (err) {
    return errorResponse(err);
  }
}

const patchSchema = z.object({ key: z.string(), enabled: z.boolean() });

export async function PATCH(req: Request) {
  try {
    const tenant = await requirePermission("settings:write");
    const { key, enabled } = patchSchema.parse(await req.json());
    const automation = await prisma.automation.upsert({
      where: { organizationId_key: { organizationId: tenant.organizationId, key } },
      update: { enabled },
      create: { organizationId: tenant.organizationId, key, enabled },
    });
    await audit(tenant, "automation.toggle", "automation", automation.id);
    return NextResponse.json({ automation });
  } catch (err) {
    return errorResponse(err);
  }
}
