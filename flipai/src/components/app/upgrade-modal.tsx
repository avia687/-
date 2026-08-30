"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, Zap } from "lucide-react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PLANS } from "@/lib/billing/plans";
import { trackClient } from "@/lib/analytics";

export function UpgradeModal({
  open,
  onClose,
  title = "נגמרו הניתוחים החינמיים",
  description = "השתמשת בכל 5 הניתוחים החינמיים החודש. שדרגו כדי להמשיך למכור חכם.",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const pro = PLANS.pro;

  async function upgrade() {
    setLoading(true);
    trackClient("upgrade_clicked", { plan: "pro", source: "modal" });
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.applied) {
        toast({
          title: "השדרוג הופעל 🎉",
          description: "מסלול Pro פעיל. אפשר להמשיך לנתח.",
          variant: "success",
        });
        onClose();
        router.refresh();
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast({ title: "השדרוג נכשל", description: "נסו שוב.", variant: "error" });
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="upgrade-title">
      <ModalHeader id="upgrade-title" title={title} description={description} />
      <div className="rounded-xl border border-primary bg-accent/50 p-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 font-display font-bold">
            <Sparkles className="h-4 w-4 text-primary" />
            {pro.name}
          </span>
          <span className="num font-display text-xl font-extrabold">
            ₪{pro.price}
            <span className="text-sm font-normal text-muted-foreground">/חודש</span>
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {pro.features.slice(0, 4).map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-primary" strokeWidth={3} />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button size="lg" onClick={upgrade} loading={loading}>
          <Zap className="h-4 w-4" />
          שדרוג ל-Pro
        </Button>
        <Button variant="ghost" onClick={onClose}>
          אולי מאוחר יותר
        </Button>
      </div>
    </Modal>
  );
}
