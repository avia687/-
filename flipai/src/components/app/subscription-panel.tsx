"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { PLANS, planLabel } from "@/lib/billing/plans";
import { trackClient } from "@/lib/analytics";

export function SubscriptionPanel({
  plan,
  simulated,
}: {
  plan: string;
  simulated: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const isPaid = plan === "pro" || plan === "seller";
  const current = PLANS[plan as keyof typeof PLANS] ?? PLANS.free;

  async function upgrade(target: "pro" | "seller") {
    setLoading(true);
    trackClient("upgrade_clicked", { plan: target, source: "settings" });
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      if (data.applied) {
        toast({ title: "השדרוג הופעל 🎉", variant: "success" });
        router.refresh();
      } else if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      toast({ title: "השדרוג נכשל", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      if (!res.ok) throw new Error();
      toast({ title: "המנוי בוטל", description: "חזרתם למסלול החינמי.", variant: "success" });
      setCancelOpen(false);
      router.refresh();
    } catch {
      toast({ title: "הביטול נכשל", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">המנוי שלי</h2>
            <p className="text-sm text-muted-foreground">ניהול המסלול והחיוב</p>
          </div>
          <Badge variant={isPaid ? "primary" : "outline"}>
            <Sparkles className="h-3 w-3" />
            {planLabel(plan)}
          </Badge>
        </div>

        {simulated && (
          <div className="mt-3 rounded-lg bg-warning/12 px-3 py-2 text-xs text-warning">
            מצב הדגמה: התשלום מדומה (לא חויב כרטיס). חברו את Stripe להפעלת חיוב אמיתי.
          </div>
        )}

        <div className="mt-4 rounded-xl border bg-background p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold">מסלול {current.name}</span>
            <span className="num font-display font-bold">
              {current.price === 0 ? "חינם" : `₪${current.price}/חודש`}
            </span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {current.features.slice(0, 3).map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {plan === "free" && (
            <Button onClick={() => upgrade("pro")} loading={loading}>
              <Sparkles className="h-4 w-4" />
              שדרוג ל-Pro
            </Button>
          )}
          {plan === "pro" && (
            <Button onClick={() => upgrade("seller")} loading={loading}>
              שדרוג ל-Seller
            </Button>
          )}
          {isPaid && (
            <Button variant="outline" onClick={() => setCancelOpen(true)}>
              ביטול מנוי
            </Button>
          )}
          <Link href="/pricing">
            <Button variant="ghost">השוואת מסלולים</Button>
          </Link>
        </div>
      </CardContent>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} labelledBy="cancel-title">
        <ModalHeader
          id="cancel-title"
          title="לבטל את המנוי?"
          description="תחזרו למסלול החינמי (5 ניתוחים בחודש). אפשר לשדרג שוב בכל עת."
        />
        <div className="flex gap-2">
          <Button variant="destructive" className="flex-1" onClick={cancel} loading={loading}>
            כן, בטלו
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setCancelOpen(false)}>
            השאר מנוי
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
