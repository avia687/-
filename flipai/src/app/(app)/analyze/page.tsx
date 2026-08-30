"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { UploadZone, type UploadItem } from "@/components/ui/upload-zone";
import { Processing } from "@/components/analyze/processing";
import { UpgradeModal } from "@/components/app/upgrade-modal";
import { useToast } from "@/components/ui/toast";
import { trackClient } from "@/lib/analytics";
import {
  CATEGORIES,
  CONDITIONS,
  categoryLabels,
  conditionLabels,
  type Category,
  type Condition,
} from "@/lib/ai/types";
import { cn } from "@/lib/utils";

export default function AnalyzePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = React.useState<UploadItem[]>([]);
  const [category, setCategory] = React.useState<Category | undefined>();
  const [condition, setCondition] = React.useState<Condition | undefined>();
  const [note, setNote] = React.useState("");
  const [showHints, setShowHints] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [limitOpen, setLimitOpen] = React.useState(false);

  async function analyze() {
    if (items.length === 0) {
      setError("יש להעלות לפחות תמונה אחת");
      return;
    }
    setError(null);
    setProcessing(true);
    trackClient("analysis_started", { images: items.length });

    const form = new FormData();
    items.forEach((it) => form.append("images", it.file));
    if (category) form.append("category", category);
    if (condition) form.append("condition", condition);
    if (note.trim()) form.append("note", note.trim());

    const startedAt = Date.now();
    try {
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();

      if (res.status === 402) {
        setProcessing(false);
        setLimitOpen(true);
        return;
      }
      if (!res.ok) {
        setProcessing(false);
        setError(data.error || "הניתוח נכשל. נסו שוב.");
        return;
      }

      // Keep the processing animation on screen a beat so it doesn't flash.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1600) await new Promise((r) => setTimeout(r, 1600 - elapsed));

      trackClient("analysis_completed", { productId: data.productId });
      router.push(`/products/${data.productId}?new=1`);
    } catch {
      setProcessing(false);
      setError("אירעה שגיאה. בדקו את החיבור ונסו שוב.");
      toast({ title: "הניתוח נכשל", variant: "error" });
    }
  }

  if (processing) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border bg-card shadow-card">
        <Processing />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          נתחו מוצר חדש
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          העלו תמונות והבינה המלאכותית תזהה, תתמחר ותכתוב מודעה — תוך שניות.
        </p>
      </div>

      <UploadZone items={items} onChange={setItems} onError={(m) => toast({ title: m, variant: "error" })} />

      {/* Optional hints */}
      <button
        type="button"
        onClick={() => setShowHints((s) => !s)}
        className="mt-4 flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
      >
        <span>עזרו ל-AI לדייק (אופציונלי)</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", showHints && "rotate-180")}
        />
      </button>

      {showHints && (
        <div className="mt-3 space-y-4 rounded-xl border bg-card p-4 animate-fade-in">
          <div>
            <p className="mb-2 text-sm font-medium">קטגוריה</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Pill
                  key={c}
                  active={category === c}
                  onClick={() => setCategory(category === c ? undefined : c)}
                >
                  {categoryLabels[c]}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">מצב המוצר</p>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <Pill
                  key={c}
                  active={condition === c}
                  onClick={() => setCondition(condition === c ? undefined : c)}
                >
                  {conditionLabels[c]}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">הערה למוכר (אופציונלי)</p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={400}
              placeholder="לדוגמה: כולל אחריות, נקנה לפני שנה, יש שריטה קטנה בגב…"
              className="min-h-[70px]"
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="sticky bottom-20 z-10 mt-5 lg:static">
        <Button
          size="lg"
          className="w-full shadow-lift"
          onClick={analyze}
          disabled={items.length === 0}
        >
          <Sparkles className="h-4 w-4" />
          נתחו עם AI
        </Button>
      </div>

      <UpgradeModal open={limitOpen} onClose={() => setLimitOpen(false)} />
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
