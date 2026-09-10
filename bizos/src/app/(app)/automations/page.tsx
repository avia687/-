"use client";

import * as React from "react";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/states";
import { PageHeader } from "@/components/app/page-header";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client";
import { TEMPLATE_LABELS } from "@/lib/messaging/templates";
import { formatDate } from "@/lib/utils";
import { Play } from "lucide-react";

type Automation = { id: string; key: string; enabled: boolean };
type Run = { id: string; automationId: string; status: string; detail?: string | null; createdAt: string };

const DESCRIPTIONS: Record<string, string> = {
  job_confirmation: "נשלח אישור ללקוח כשנקבעת עבודה",
  reminder_24h: "תזכורת ללקוח יום לפני העבודה",
  thank_you: "הודעת תודה לאחר סיום העבודה",
  review_request: "בקשת ביקורת לאחר סיום העבודה (יוצר קישור אוטומטית)",
  quote_followup: "מעקב אחרי הצעת מחיר שנשלחה",
  payment_reminder: "תזכורת תשלום ללקוח",
};

export default function AutomationsPage() {
  const toast = useToast();
  const [automations, setAutomations] = React.useState<Automation[] | null>(null);
  const [runs, setRuns] = React.useState<Run[]>([]);
  const [running, setRunning] = React.useState(false);

  const load = React.useCallback(async () => {
    const d = await api<{ automations: Automation[]; runs: Run[] }>("/api/automations");
    setAutomations(d.automations);
    setRuns(d.runs);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  async function toggle(a: Automation) {
    setAutomations((xs) => xs?.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)) ?? null);
    try {
      await api("/api/automations", { method: "PATCH", body: { key: a.key, enabled: !a.enabled } });
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
      load();
    }
  }

  async function runDue() {
    setRunning(true);
    try {
      const r = await api<{ sent: number }>("/api/automations/run-due", { method: "POST" });
      toast(`הופעל — נשלחו ${r.sent} הודעות`);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setRunning(false);
    }
  }

  if (automations === null) return <LoadingScreen />;

  return (
    <div>
      <PageHeader
        title="אוטומציות"
        subtitle="הפעל תהליכים אוטומטיים ללקוחות. כל אוטומציה ניתנת להפעלה/כיבוי."
        action={<Button variant="outline" onClick={runDue} disabled={running}><Play size={15} /> הרץ תזכורות שממתינות</Button>}
      />

      <div className="space-y-2">
        {automations.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-center gap-3 pt-5">
              <div className="flex-1">
                <p className="font-medium">{TEMPLATE_LABELS[a.key as keyof typeof TEMPLATE_LABELS] ?? a.key}</p>
                <p className="text-xs text-muted-foreground">{DESCRIPTIONS[a.key]}</p>
              </div>
              <button
                onClick={() => toggle(a)}
                role="switch"
                aria-checked={a.enabled}
                aria-label={`הפעל/כבה ${a.key}`}
                className={`relative h-6 w-11 rounded-full transition-colors ${a.enabled ? "bg-primary" : "bg-input"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${a.enabled ? "right-0.5" : "right-5"}`} />
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mb-2 mt-6 text-sm font-semibold">יומן הרצה</p>
      <Card>
        <CardContent className="pt-5">
          {runs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">עדיין לא רצו אוטומציות</p>
          ) : (
            <div className="divide-y">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted-foreground">{r.detail}</span>
                  <div className="flex items-center gap-2">
                    <Badge color={r.status === "success" ? "green" : "red"}>{r.status === "success" ? "הצליח" : "נכשל"}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(r.createdAt, true)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
