import type { AIProvider } from "@/lib/ai/provider";
import type {
  AIAction,
  AssistantReply,
  BusinessSnapshot,
  ConfigProposal,
  CustomerReplyInput,
  MarketingInput,
} from "@/lib/ai/types";
import { MockAIProvider } from "@/lib/ai/mock";

const API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/**
 * Real AI adapter (server-side only — the API key never reaches the client).
 * Grounds the model with the snapshot as a system message and forbids
 * inventing facts. Falls back to the deterministic mock on any error so the
 * product keeps working.
 */
export class OpenAIProvider implements AIProvider {
  private fallback = new MockAIProvider();

  private async chat(system: string, user: string): Promise<string | null> {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.4,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.choices?.[0]?.message?.content ?? null;
    } catch {
      return null;
    }
  }

  private baseSystem(s: BusinessSnapshot): string {
    return [
      s.aiInstructions,
      `שם העסק: ${s.businessName}. סוג: ${s.businessType}. מטבע: ${s.currency}.`,
      `מחירון: ${s.services.map((x) => `${x.name}=${x.price}`).join(", ") || "אין"}.`,
      "חשוב: השתמש אך ורק בנתונים שסופקו. אל תמציא מחירים, לקוחות או עובדות. ענה בעברית.",
    ].join("\n");
  }

  async ask(question: string, s: BusinessSnapshot): Promise<AssistantReply> {
    const context = JSON.stringify({
      todayJobs: s.todayJobs,
      upcomingJobs: s.upcomingJobs,
      openQuotes: s.openQuotes,
      outstandingPayments: s.outstandingPayments,
      hotLeads: s.hotLeads,
      stats: s.stats,
    });
    const out = await this.chat(this.baseSystem(s), `נתוני העסק: ${context}\n\nשאלה: ${question}`);
    if (!out) return this.fallback.ask(question, s);
    return { text: out };
  }

  async customerReply(input: CustomerReplyInput): Promise<string> {
    const out = await this.chat(
      this.baseSystem(input.snapshot) + "\nנסח תשובה קצרה ומנומסת ללקוח.",
      `הודעת הלקוח: ${input.customerMessage}`,
    );
    return out ?? this.fallback.customerReply(input);
  }

  async marketing(input: MarketingInput): Promise<string> {
    const out = await this.chat(
      this.baseSystem(input.snapshot) + `\nכתוב תוכן שיווקי לערוץ ${input.channel}.`,
      `נושא: ${input.topic}`,
    );
    return out ?? this.fallback.marketing(input);
  }

  async proposeConfig(description: string): Promise<ConfigProposal> {
    // Kept deterministic for a predictable confirm step; real JSON-mode
    // generation is a drop-in extension here.
    return this.fallback.proposeConfig(description);
  }

  async proposeAction(instruction: string, snapshot: BusinessSnapshot): Promise<AIAction> {
    // Deterministic, grounded action parsing — a predictable confirm step
    // matters more than free-form generation here. Real tool/JSON-mode calling
    // plugs in at this seam.
    return this.fallback.proposeAction(instruction, snapshot);
  }
}
