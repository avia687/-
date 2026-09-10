import type { MessageTemplateKey } from "@/lib/business/types";

export const TEMPLATE_LABELS: Record<MessageTemplateKey, string> = {
  job_confirmation: "אישור הזמנה",
  reminder_24h: "תזכורת (יום לפני)",
  thank_you: "הודעת תודה",
  review_request: "בקשת ביקורת",
  quote_followup: "מעקב הצעת מחיר",
  payment_reminder: "תזכורת תשלום",
};

/** Fills {placeholders} in a template body. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}
