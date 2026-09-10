"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input } from "@/components/ui/primitives";
import { useBusiness } from "@/components/business-context";
import { api } from "@/lib/client";
import { Sparkles, Send, MessageSquare } from "lucide-react";

type Msg = { role: "user" | "assistant"; text: string };
const STARTERS = ["מה יש לי היום?", "מי חייב לי כסף?", "איזה שירות הכי רווחי?", "מי הליד הכי חם שלי?", "מה כדאי לי לעשות היום?"];

export default function AssistantPage() {
  const { config } = useBusiness();
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<string[]>(STARTERS);
  const [convoId, setConvoId] = React.useState<string>();
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  async function send(q: string) {
    if (!q.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await api<{ reply: { text: string; suggestions?: string[] }; conversationId: string }>("/api/ai/ask", {
        method: "POST",
        body: { question: q, conversationId: convoId },
      });
      setConvoId(res.conversationId);
      setMessages((m) => [...m, { role: "assistant", text: res.reply.text }]);
      if (res.reply.suggestions) setSuggestions(res.reply.suggestions);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: e instanceof Error ? e.message : "שגיאה" }]);
    } finally {
      setLoading(false);
    }
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
              שאל אותי כל דבר על העסק שלך. אני עונה מתוך הנתונים האמיתיים — לקוחות, {config.terminology.jobs}, תשלומים ולידים.
            </CardContent>
          </Card>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card"}`}>
              {m.text}
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
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="כתוב שאלה..." />
        <Button type="submit" size="icon" disabled={loading}><Send size={16} /></Button>
      </form>
    </div>
  );
}
