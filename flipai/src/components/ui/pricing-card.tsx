"use client";

import { Check } from "lucide-react";
import { cn, formatILS } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function PricingCard({
  name,
  price,
  period = "לחודש",
  tagline,
  features,
  featured,
  cta,
}: {
  name: string;
  price: number;
  period?: string;
  tagline: string;
  features: string[];
  featured?: boolean;
  cta: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-6 transition-all",
        featured
          ? "border-primary bg-card shadow-lift ring-1 ring-primary/30 md:-mt-3 md:mb-3 md:scale-[1.03]"
          : "bg-card shadow-soft",
      )}
    >
      {featured && (
        <div className="absolute -top-3 right-6">
          <Badge variant="primary" className="shadow-accent">
            הכי פופולרי
          </Badge>
        </div>
      )}
      <h3 className="font-display text-xl font-bold tracking-tight">{name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
      <div className="mt-4 flex items-end gap-1">
        <span className="num font-display text-4xl font-extrabold tracking-tight">
          {price === 0 ? "חינם" : formatILS(price)}
        </span>
        {price !== 0 && (
          <span className="mb-1 text-sm text-muted-foreground">/{period}</span>
        )}
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                featured ? "bg-primary text-primary-foreground" : "bg-accent text-primary",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className="text-foreground/90">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">{cta}</div>
    </div>
  );
}
