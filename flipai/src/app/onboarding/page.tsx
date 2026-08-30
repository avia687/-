"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Smartphone,
  Car,
  Shirt,
  Sofa,
  Gem,
  Package,
  CalendarDays,
  CalendarClock,
  CalendarCheck,
  ArrowLeft,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/ai/types";

const categories: { id: Category; label: string; icon: React.ReactNode }[] = [
  { id: "electronics", label: "אלקטרוניקה", icon: <Smartphone className="h-5 w-5" /> },
  { id: "vehicles", label: "רכב", icon: <Car className="h-5 w-5" /> },
  { id: "fashion", label: "אופנה", icon: <Shirt className="h-5 w-5" /> },
  { id: "furniture", label: "ריהוט", icon: <Sofa className="h-5 w-5" /> },
  { id: "collectibles", label: "אספנות", icon: <Gem className="h-5 w-5" /> },
  { id: "other", label: "אחר", icon: <Package className="h-5 w-5" /> },
];

const frequencies = [
  { id: "occasionally", label: "מדי פעם", hint: "מוכר פה ושם", icon: <CalendarDays className="h-5 w-5" /> },
  { id: "monthly", label: "כל חודש", hint: "כמה פריטים בחודש", icon: <CalendarClock className="h-5 w-5" /> },
  { id: "frequently", label: "לעיתים קרובות", hint: "מוכר הרבה", icon: <CalendarCheck className="h-5 w-5" /> },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = React.useState(0);
  const [category, setCategory] = React.useState<Category | null>(null);
  const [frequency, setFrequency] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function finish(freq: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellCategory: category, sellFrequency: freq }),
      });
      if (!res.ok) throw new Error();
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast({ title: "משהו השתבש, נסו שוב", variant: "error" });
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      <header className="relative flex items-center justify-between px-5 py-4">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 py-8">
        <div className="w-full max-w-lg">
          {/* progress */}
          <div className="mb-6 flex items-center justify-center gap-2">
            {[0, 1].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-8 bg-primary" : "w-4 bg-muted",
                  i < step && "bg-primary",
                )}
              />
            ))}
          </div>

          {step === 0 && (
            <div className="animate-fade-in text-center">
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                מה בעיקר תמכרו?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                כדי שנוכל לדייק את ההערכות והמודעות עבורכם
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCategory(c.id);
                      setTimeout(() => setStep(1), 150);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-sm font-medium transition-all hover:border-primary/50 hover:shadow-card",
                      category === c.id && "border-primary bg-accent/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-full",
                        category === c.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-primary",
                      )}
                    >
                      {c.icon}
                    </span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="animate-fade-in text-center">
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                כל כמה זמן אתם מוכרים?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                נתאים לכם את החוויה. אפשר לשנות בכל עת.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                {frequencies.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setFrequency(f.id);
                      finish(f.id);
                    }}
                    disabled={loading}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border bg-card p-4 text-start transition-all hover:border-primary/50 hover:shadow-card disabled:opacity-60",
                      frequency === f.id && "border-primary bg-accent/60",
                    )}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                      {f.icon}
                    </span>
                    <span>
                      <span className="block font-semibold">{f.label}</span>
                      <span className="block text-sm text-muted-foreground">
                        {f.hint}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                className="mt-5"
                onClick={() => setStep(0)}
                disabled={loading}
              >
                <ArrowLeft className="h-4 w-4" />
                חזרה
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
