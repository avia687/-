import { prisma } from "@/lib/db";
import { getMessaging } from "@/lib/messaging";
import { renderTemplate } from "@/lib/messaging/templates";
import { resolveConfig } from "@/lib/business/resolve";
import { formatDate } from "@/lib/utils";
import type { MessageTemplateKey } from "@/lib/business/types";

// Maps a business trigger to the automation keys it fires.
const TRIGGER_MAP: Record<string, MessageTemplateKey[]> = {
  job_created: ["job_confirmation"],
  job_completed: ["thank_you", "review_request"],
  quote_sent: ["quote_followup"],
  due_reminder: ["reminder_24h"],
};

export type DispatchContext = {
  dedupeKey: string;
  customerId?: string;
  customerName?: string;
  date?: Date | string;
  amount?: number;
};

/**
 * Runs every enabled automation bound to `trigger` for one organization only.
 * Each run is deduped on (automationId, dedupeKey) so a retry never
 * double-sends, records an AutomationRun (success/failed), and — for the
 * review_request automation — also creates a Review request the owner can share.
 * Returns the number of messages actually sent.
 */
export async function dispatch(
  organizationId: string,
  trigger: keyof typeof TRIGGER_MAP,
  ctx: DispatchContext,
): Promise<number> {
  const keys = TRIGGER_MAP[trigger] ?? [];
  if (!keys.length) return 0;

  const profile = await prisma.businessProfile.findUnique({ where: { organizationId } });
  const config = resolveConfig(profile);
  const businessName = profile?.name ?? "העסק";

  let sent = 0;
  for (const key of keys) {
    const automation = await prisma.automation.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    if (!automation || !automation.enabled) continue;

    const dedupeKey = `${key}:${ctx.dedupeKey}`;
    // Dedupe: skip if this exact automation+key already ran.
    const already = await prisma.automationRun.findUnique({
      where: { automationId_dedupeKey: { automationId: automation.id, dedupeKey } },
    });
    if (already) continue;

    try {
      let reviewLink = "";
      if (key === "review_request") {
        const review = await prisma.review.create({
          data: { organizationId, customerId: ctx.customerId ?? null },
        });
        reviewLink = `/review/${review.publicToken}`;
      }

      const body = renderTemplate(config.messageTemplates[key], {
        customer: ctx.customerName ?? "לקוח",
        business: businessName,
        date: ctx.date ? formatDate(ctx.date) : "",
        time: ctx.date ? new Date(ctx.date).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "",
        amount: ctx.amount != null ? String(ctx.amount) : "",
        link: reviewLink,
      });

      const result = await getMessaging().send({ channel: "whatsapp", toName: ctx.customerName, body, template: key });
      await prisma.message.create({
        data: { organizationId, channel: "whatsapp", toName: ctx.customerName ?? null, template: key, body, status: result.status },
      });
      await prisma.automationRun.create({
        data: { organizationId, automationId: automation.id, status: "success", detail: `נשלח: ${key}`, dedupeKey },
      });
      sent++;
    } catch (err) {
      await prisma.automationRun
        .create({
          data: {
            organizationId,
            automationId: automation.id,
            status: "failed",
            detail: err instanceof Error ? err.message : "שגיאה",
            dedupeKey,
          },
        })
        .catch(() => {});
    }
  }
  return sent;
}
