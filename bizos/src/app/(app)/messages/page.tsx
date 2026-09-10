"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Label, Select, Textarea, Badge } from "@/components/ui/primitives";
import { LoadingScreen, EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/app/page-header";
import { useToast } from "@/components/ui/toast";
import { useBusiness } from "@/components/business-context";
import { api } from "@/lib/client";
import { TEMPLATE_LABELS, renderTemplate } from "@/lib/messaging/templates";
import { formatDate } from "@/lib/utils";
import type { MessageTemplateKey } from "@/lib/business/types";
import { MessageCircle, Send, AlertTriangle } from "lucide-react";

type Customer = { id: string; name: string; phone?: string | null };
type Message = { id: string; toName?: string | null; template?: string | null; body: string; status: string; createdAt: string };

export default function MessagesPage() {
  const { config, businessName } = useBusiness();
  const toast = useToast();
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [messages, setMessages] = React.useState<Message[] | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [customerId, setCustomerId] = React.useState("");
  const [template, setTemplate] = React.useState<MessageTemplateKey | "">("");
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(async () => {
    const [c, m] = await Promise.all([
      api<{ customers: Customer[] }>("/api/customers"),
      api<{ messages: Message[]; connected: boolean }>("/api/messages"),
    ]);
    setCustomers(c.customers);
    setMessages(m.messages);
    setConnected(m.connected);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const customer = customers.find((c) => c.id === customerId);

  // Live variable substitution preview.
  function applyTemplate(key: MessageTemplateKey | "") {
    setTemplate(key);
    if (!key) return;
    setBody(
      renderTemplate(config.messageTemplates[key], {
        customer: customer?.name ?? "לקוח",
        business: businessName,
        date: "",
        time: "",
        amount: "",
        link: "",
      }),
    );
  }

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await api<{ connected: boolean }>("/api/messages", {
        method: "POST",
        body: { channel: "whatsapp", toName: customer?.name, toAddress: customer?.phone, template: template || null, body },
      });
      setConnected(res.connected);
      toast(res.connected ? "ההודעה נשלחה" : "ההודעה נשמרה בתור (אין ספק מחובר)");
      setBody("");
      setTemplate("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה בשליחה", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <PageHeader title="הודעות" subtitle="שלח הודעות ללקוחות עם תבניות מוכנות" />

      {!connected && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle size={16} />
          ספק WhatsApp אינו מחובר — הודעות נשמרות בתור. חבר ספק בהגדרות ← אינטגרציות.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div>
              <Label>לקוח</Label>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— בחר לקוח —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>תבנית</Label>
              <Select value={template} onChange={(e) => applyTemplate(e.target.value as MessageTemplateKey)}>
                <option value="">— ללא תבנית —</option>
                {Object.entries(TEMPLATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label>תוכן ההודעה</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[120px]" placeholder="כתוב הודעה או בחר תבנית..." />
            </div>
            <Button onClick={send} disabled={sending || !body.trim()} className="w-full">
              <Send size={16} /> {sending ? "שולח..." : "שלח"}
            </Button>
          </CardContent>
        </Card>

        <div>
          <p className="mb-2 text-sm font-semibold">היסטוריית הודעות</p>
          {messages === null ? (
            <LoadingScreen />
          ) : messages.length === 0 ? (
            <EmptyState icon={MessageCircle} title="אין הודעות" description="שלח את ההודעה הראשונה" />
          ) : (
            <div className="space-y-2">
              {messages.map((m) => (
                <Card key={m.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{m.toName ?? "לקוח"}</p>
                      <Badge color={m.status === "sent" || m.status === "delivered" ? "green" : m.status === "failed" ? "red" : "amber"}>
                        {m.status === "queued" ? "בתור" : m.status === "sent" ? "נשלח" : m.status === "failed" ? "נכשל" : m.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{m.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(m.createdAt, true)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
