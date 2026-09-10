import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { dispatch } from "@/lib/automations/engine";
import { addDays, startOfDay } from "@/lib/utils";

/**
 * Runs time-delayed automations that are due. Designed to be called by a cron
 * (e.g. hourly) — here it is tenant-scoped and idempotent via the engine's
 * dedupeKey, so repeated calls never double-send. Handles the 24h job reminder.
 */
export async function POST() {
  try {
    const tenant = await requireTenant();
    const org = tenant.organizationId;

    const tomorrow = addDays(startOfDay(), 1);
    const dayAfter = addDays(tomorrow, 1);
    const jobsTomorrow = await prisma.job.findMany({
      where: { organizationId: org, status: "scheduled", startAt: { gte: tomorrow, lt: dayAfter } },
      include: { customer: true },
    });

    let sent = 0;
    for (const job of jobsTomorrow) {
      sent += await dispatch(org, "due_reminder", {
        dedupeKey: `reminder:${job.id}:${startOfDay().toISOString().slice(0, 10)}`,
        customerName: job.customer?.name,
        date: job.startAt,
      });
    }
    return NextResponse.json({ ok: true, sent, considered: jobsTomorrow.length });
  } catch (err) {
    return errorResponse(err);
  }
}
