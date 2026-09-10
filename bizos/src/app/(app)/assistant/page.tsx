"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input } from "@/components/ui/primitives";
import { useBusiness } from "@/components/business-context";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client";
import { calcQuote } from "@/lib/quote";
import { formatMoney } from "@/lib/utils";
import type { AIAction } from "@/lib/ai/types";
import { Sparkles, Send, MessageSquare, Check, X } from "lucide-react";

type Msg = { role: "user" | "assistant"; text: string; action?: AIAction };
const STARTERS = ["מה יש לי היום?", "מי חייב לי כסף?", "איזה שירות הכי רווחי?", "תיצור הצעת מחיר ל..."];
// Instructions that should propose a write-action instead of a read answer.
const ACTION_RE = /תיצור|צור |תכתוב|תשלח|שלח |הצעת מחיר|תקבע/;

export default function AssistantPage() {
  const { config, currency } = useBusiness();
  const toast = useToast();
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<string[]>(STARTERS);
  const [convoId, setConvoId] = React.useState<string>();
  const [confirming, setConfirming] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  async function send(q: string) {
    if (!q.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      if (ACTION_RE.test(q)) {
        const { action } = await api<{ action: AIAction }>("/api/ai/act", { method: "POST", body: { instruction: q } });
        const text =
          action.type === "none"
            ? action.summary
            : `${action.summary}\nאשר כדי לבצע, או בטל.`;
        setMessages((m) => [...m, { role: "assistant", text, action: action.type === "none" ? undefined : action }]);
      } else {
        const res = await api<{ reply: { text: string; suggestions?: string[] }; conversationId: string }>("/api/ai/ask", {
          method: "POST",
          body: { question: q, conversationId: convoId },
        });
        setConvoId(res.conversationId);
        setMessages((m) => [...m, { role: "assistant", text: res.reply.text }]);
        if (res.reply.suggestions) setSuggestions(res.reply.suggestions);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: e instanceof Error ? e.message : "שגיאה" }]);
    } finally {
      setLoading(false);
    }
  }

  // Confirmation is required before any write — the action executes here.
  async function confirm(action: AIAction, idx: number) {
    if (action.type === "none") return;
    setConfirming(true);
    try {
      if (action.type === "create_quote") {
        await api("/api/quotes", {
          method: "POST",
          body: { customerId: action.draft.customerId ?? null, items: action.draft.items, discount: 0, taxRate: 0.17, taxIncluded: false, status: "draft" },
        });
        toast("הצעת מחיר נוצרה כטיוטה");
      } else if (action.type === "send_message") {
        await api("/api/messages", {
          method: "POST",
          body: { channel: "whatsapp", toName: action.draft.customerName, body: action.draft.body },
        });
        toast("ההודעה נשלחה/נשמרה");
      }
      // Replace the action card with a confirmed note.
      setMessages((m) => m.map((msg, i) => (i === idx ? { role: "assistant", text: "✅ בוצע." } : msg)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setConfirming(false);
    }
  }

  function cancel(idx: number) {
    setMessages((m) => m.map((msg, i) => (i === idx ? { role: "assistant", text: "בוטל." } : msg)));
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-2xl flex-col">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Sparkles size={18} /></div>
        <div>
          <h1 className="font-bold">העוזר העסקי</h1>
          <p className="text-xs text-muted-foreground">מבוסס על נתוני העסק שלך</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin pb-2">
        {messages.length === 0 && (
          <Card>
            <CardContent className="pt-5 text-center text-sm text-muted-foreground">
              <MessageSquare className="mx-auto mb-2 text-primary" />
              שאל אותי על העסק שלך, או בקש פעולה: "תיצור הצעת מחיר ל&lt;לקוח&gt;". כל פעולה דורשת אישור לפני ביצוע.
            </CardContent>
          </Card>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card"}`}>
              <p className="whitespace-pre-line">{m.text}</p>
              {m.action && m.action.type !== "none" && (
                <ActionPreview action={m.action} currency={currency} onConfirm={() => confirm(m.action!, i)} onCancel={() => cancel(i)} busy={confirming} />
              )}
            </div>
          </div>
        ))}
        {loading && <div className="flex justify-end"><div className="rounded-2xl border bg-card px-4 py-2.5 text-sm text-muted-foreground">חושב...</div></div>}
        <div ref={endRef} />
      </div>

      {suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="rounded-full border bg-card px-3 py-1 text-xs hover:bg-secondary">{s}</button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="שאלה או פעולה..." />
        <Button type="submit" size="icon" disabled={loading}><Send size={16} /></Button>
      </form>
    </div>
  );
}

function ActionPreview({
  action, currency, onConfirm, onCancel, busy,
}: {
  action: Exclude<AIAction, { type: "none" }>;
  currency: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-2 rounded-lg border bg-secondary/60 p-3 text-xs">
      {action.type === "create_quote" && (
        <div>
          <p className="font-semibold">טיוטת הצעת מחיר · {action.draft.customerName}</p>
          <ul className="mt-1">
            {action.draft.items.map((it, i) => (
              <li key={i} className="flex justify-between"><span>{it.name} ×{it.quantity}</span><span>{formatMoney(it.unitPrice * it.quantity, currency)}</span></li>
            ))}
          </ul>
          <p className="mt-1 font-medium">
            סה"כ כולל מע"מ: {formatMoney(calcQuote({ items: action.draft.items, discount: 0, taxRate: 0.17, taxIncluded: false }).total, currency)}
          </p>
        </div>
      )}
      {action.type === "send_message" && (
        <div>
          <p className="font-semibold">הודעה ל{action.draft.customerName}</p>
          <p className="mt-1 text-muted-foreground">{action.draft.body}</p>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={onConfirm} disabled={busy}><Check size={14} /> אשר וביצוע</Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}><X size={14} /> בטל</Button>
      </div>
    </div>
  );
}
