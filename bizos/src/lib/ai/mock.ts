import type { AIProvider } from "@/lib/ai/provider";
import type {
  AIAction,
  AssistantReply,
  BusinessSnapshot,
  ConfigProposal,
  CustomerReplyInput,
  MarketingInput,
} from "@/lib/ai/types";
import { formatMoney } from "@/lib/utils";

/**
 * Deterministic, rule-based assistant. Produces genuinely useful Hebrew answers
 * strictly from the BusinessSnapshot (real tenant data) — no external API and
 * no invented facts. Used automatically whenever OPENAI_API_KEY is absent.
 */
export class MockAIProvider implements AIProvider {
  async ask(question: string, s: BusinessSnapshot): Promise<AssistantReply> {
    const q = question.toLowerCase();
    const cur = s.currency;

    const suggestions = [
      "מה יש לי היום?",
      "מי חייב לי כסף?",
      "איזה שירות הכי רווחי?",
      "מה כדאי לי לעשות היום?",
    ];

    if (/היום|today|מה יש/.test(q)) {
      if (!s.todayJobs.length) return { text: "אין לך עבודות מתוזמנות להיום. זה זמן טוב ליצור קשר עם לידים פתוחים.", suggestions };
      const lines = s.todayJobs.map((j) => `• ${j.time} — ${j.title}${j.customer ? ` (${j.customer})` : ""}`);
      return { text: `היום יש לך ${s.todayJobs.length} עבודות:\n${lines.join("\n")}`, suggestions };
    }

    if (/חייב|כסף|תשלום|owe/.test(q)) {
      if (!s.outstandingPayments.length) return { text: "אין תשלומים פתוחים — כל הכבוד! 💪", suggestions };
      const total = s.outstandingPayments.reduce((a, p) => a + p.amount, 0);
      const lines = s.outstandingPayments.slice(0, 6).map((p) => `• ${p.customer ?? "לקוח"} — ${formatMoney(p.amount, cur)} (${p.status})`);
      return { text: `יש ${s.outstandingPayments.length} תשלומים פתוחים בסך ${formatMoney(total, cur)}:\n${lines.join("\n")}`, suggestions };
    }

    if (/רווחי|הכי טוב|מוביל|profitable/.test(q)) {
      if (!s.stats.topService) return { text: "עדיין אין מספיק נתונים כדי לזהות את השירות הרווחי ביותר.", suggestions };
      return { text: `השירות המוביל שלך החודש הוא "${s.stats.topService.name}" עם הכנסות של ${formatMoney(s.stats.topService.revenue, cur)}.`, suggestions };
    }

    if (/ליד|lead|חם/.test(q)) {
      if (!s.hotLeads.length) return { text: "אין כרגע לידים חמים. שווה לחזור ללידים שטרם נסגרו.", suggestions };
      const top = s.hotLeads[0];
      return { text: `הליד הכי חם: "${top.title}" — שווי משוער ${formatMoney(top.value, cur)}, סיכוי סגירה ${top.probability}%.`, suggestions };
    }

    if (/הצעת מחיר|הצעות|quote/.test(q)) {
      if (!s.openQuotes.length) return { text: "אין הצעות מחיר פתוחות כרגע.", suggestions };
      const total = s.openQuotes.reduce((a, x) => a + x.total, 0);
      return { text: `יש לך ${s.openQuotes.length} הצעות מחיר פתוחות בסך ${formatMoney(total, cur)}. שווה לשלוח תזכורת ללקוחות שטרם אישרו.`, suggestions };
    }

    if (/ביקורת|review/.test(q)) {
      return { text: `${s.stats.missingReviews} לקוחות סיימו עבודה ועדיין לא השאירו ביקורת. שליחת בקשת ביקורת יכולה לשפר את הדירוג שלך.`, suggestions };
    }

    if (/כדאי|לעשות|מומלץ|היום.*עשות/.test(q)) {
      return { text: this.dailyBriefing(s), suggestions };
    }

    // Default: a business briefing.
    return { text: this.dailyBriefing(s), suggestions };
  }

  private dailyBriefing(s: BusinessSnapshot): string {
    const parts: string[] = [];
    parts.push(`יש לך ${s.todayJobs.length} עבודות היום.`);
    if (s.outstandingPayments.length) {
      const total = s.outstandingPayments.reduce((a, p) => a + p.amount, 0);
      parts.push(`${s.outstandingPayments.length} תשלומים פתוחים בסך ${formatMoney(total, s.currency)}.`);
    }
    if (s.openQuotes.length) parts.push(`${s.openQuotes.length} הצעות מחיר ממתינות לאישור.`);
    if (s.stats.missingReviews) parts.push(`${s.stats.missingReviews} לקוחות לא השאירו ביקורת.`);
    if (s.hotLeads.length) parts.push(`הליד הכי חם: "${s.hotLeads[0].title}".`);
    return parts.join(" ");
  }

  async customerReply({ customerMessage, snapshot }: CustomerReplyInput): Promise<string> {
    const msg = customerMessage.toLowerCase();
    // Price questions answered strictly from the price list.
    const matched = snapshot.services.find((svc) =>
      msg.includes(svc.name.split(" ")[0]?.toLowerCase() ?? "___"),
    );
    if (/כמה|מחיר|עולה|price/.test(msg)) {
      if (matched) {
        return `שלום! ${matched.name} אצלנו הוא ${formatMoney(matched.price, snapshot.currency)}. נשמח לתאם לך מועד — ${snapshot.businessName}.`;
      }
      const cheapest = [...snapshot.services].sort((a, b) => a.price - b.price)[0];
      if (cheapest) {
        return `שלום! המחירים שלנו מתחילים מ-${formatMoney(cheapest.price, snapshot.currency)} בהתאם לסוג השירות. נשמח לפרט — ${snapshot.businessName}.`;
      }
    }
    if (/מתי|זמין|תור|פנוי/.test(msg)) {
      return `שלום! נשמח לתאם מועד שנוח לך. מתי מתאים לך? — ${snapshot.businessName}.`;
    }
    return `שלום וקיבלנו את פנייתך 🙏 נחזור אליך בהקדם עם כל הפרטים — ${snapshot.businessName}.`;
  }

  async marketing({ channel, topic, snapshot }: MarketingInput): Promise<string> {
    const svc = snapshot.services[0];
    const price = svc ? ` החל מ-${formatMoney(svc.price, snapshot.currency)}` : "";
    const tag = channel === "instagram" || channel === "facebook" ? "\n\n#עסק_מקומי #שירות_מקצועי" : "";
    return `✨ ${snapshot.businessName} — ${topic}!\n\nשירות מקצועי ואמין${price}. הזמינו עכשיו ותיהנו מאיכות ללא פשרות.\n📞 צרו קשר עוד היום.${tag}`;
  }

  async proposeAction(instruction: string, s: BusinessSnapshot): Promise<AIAction> {
    const text = instruction.trim();
    // Find a customer mentioned by name (grounded — never invented).
    const customer = s.customers.find((c) => text.includes(c.name) || text.includes(c.name.split(" ")[0]));

    if (/הצעת מחיר|הצעה|quote/.test(text)) {
      if (!customer) {
        return { type: "none", summary: "לא זיהיתי לקוח קיים בבקשה.", missing: "customer" };
      }
      // Prefer a service named in the instruction; else the top service.
      const svc = s.services.find((x) => text.includes(x.name.split(" ")[0])) ?? s.services[0];
      if (!svc) return { type: "none", summary: "אין שירותים במחירון ליצירת הצעה.", missing: "service" };
      return {
        type: "create_quote",
        summary: `יצירת טיוטת הצעת מחיר ל${customer.name} עם "${svc.name}" (${svc.price}).`,
        draft: {
          customerId: customer.id,
          customerName: customer.name,
          items: [{ serviceId: svc.id, name: svc.name, quantity: 1, unitPrice: svc.price }],
        },
      };
    }

    if (/תכתוב|הודעה|שלח|תשלח|message/.test(text)) {
      if (!customer) return { type: "none", summary: "לא זיהיתי לקוח לשליחת הודעה.", missing: "customer" };
      const body = `שלום ${customer.name}, נשמח לעמוד לרשותך. — ${s.businessName}`;
      return {
        type: "send_message",
        summary: `הכנת הודעה ל${customer.name}.`,
        draft: { customerId: customer.id, customerName: customer.name, body },
      };
    }

    return { type: "none", summary: "לא הבנתי איזו פעולה לבצע. נסה: \"תיצור הצעת מחיר ל<לקוח>\"." };
  }

  async proposeConfig(description: string): Promise<ConfigProposal> {
    // Heuristic proposal for a custom business (no external API).
    return {
      label: description.trim().slice(0, 40) || "עסק מותאם",
      terminology: { customer: "לקוח", job: "עבודה", service: "שירות", employee: "עובד" },
      services: [
        { name: "שירות בסיסי", category: "כללי", price: 200, durationMin: 60 },
        { name: "שירות מורחב", category: "כללי", price: 450, durationMin: 120 },
        { name: "ייעוץ / בדיקה", category: "ייעוץ", price: 150, durationMin: 45 },
      ],
    };
  }
}
