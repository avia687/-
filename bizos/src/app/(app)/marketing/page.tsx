"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/app/page-header";
import { api } from "@/lib/client";
import { Megaphone, Copy, Sparkles } from "lucide-react";

const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "אימייל" },
  { key: "instagram", label: "אינסטגרם" },
  { key: "facebook", label: "פייסבוק" },
  { key: "flyer", label: "פלייר" },
] as const;

export default function MarketingPage() {
  const toast = useToast();
  const [channel, setChannel] = React.useState<(typeof CHANNELS)[number]["key"]>("whatsapp");
  const [topic, setTopic] = React.useState("");
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function generate() {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const res = await api<{ text: string }>("/api/ai/marketing", { method: "POST", body: { channel, topic } });
      setText(res.text);
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="מרכז שיווק" subtitle="צור תוכן שיווקי מותאם לעסק שלך בעזרת AI" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div>
              <Label>ערוץ</Label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => (
                  <button key={c.key} onClick={() => setChannel(c.key)} className={`rounded-full border px-3 py-1 text-sm ${channel === c.key ? "border-primary bg-accent" : "hover:bg-secondary"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>נושא / מבצע</Label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="לדוגמה: מבצע קיץ 20% הנחה" />
            </div>
            <Button onClick={generate} disabled={loading || !topic.trim()} className="w-full">
              <Sparkles size={16} /> {loading ? "יוצר..." : "צור תוכן"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">התוצאה</Label>
              {text && (
                <button onClick={() => { navigator.clipboard?.writeText(text); toast("הועתק"); }} className="flex items-center gap-1 text-sm text-primary hover:underline">
                  <Copy size={14} /> העתק
                </button>
              )}
            </div>
            {text ? (
              <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[200px]" />
            ) : (
              <div className="flex min-h-[200px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
                <Megaphone className="mb-2" />
                התוכן שייווצר יופיע כאן — ניתן לערוך לפני שליחה
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
