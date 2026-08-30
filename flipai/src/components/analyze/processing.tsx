"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { LogoMark } from "@/components/logo";

const STEPS = [
  "מזהה את המוצר…",
  "בודק את המצב מהתמונות…",
  "מעריך שווי שוק…",
  "יוצר מודעה מקצועית…",
  "מגבש המלצת מכירה…",
];

/** Animated AI processing overlay. Advances through steps while the request
 *  is in flight; the last step holds until the parent resolves. */
export function Processing() {
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    const timers = STEPS.map((_, i) =>
      i === 0
        ? null
        : setTimeout(() => setStep((s) => Math.max(s, i)), i * 750),
    );
    return () => timers.forEach((t) => t && clearTimeout(t));
  }, []);

  return (
    <div className="flex flex-col items-center py-10 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative mb-6"
      >
        <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/30" />
        <LogoMark className="relative h-16 w-16 [&_svg]:h-8 [&_svg]:w-8" />
      </motion.div>
      <h2 className="font-display text-xl font-bold tracking-tight">
        ה-AI מנתח את המוצר
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">כמה שניות בלבד…</p>

      <div className="mt-6 w-full max-w-xs space-y-2.5 text-start">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: i <= step ? 1 : 0.4, x: 0 }}
              className="flex items-center gap-3 text-sm"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <AnimatePresence mode="wait">
                  {done ? (
                    <motion.span
                      key="done"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-foreground"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </motion.span>
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  )}
                </AnimatePresence>
              </span>
              <span
                className={
                  done || active ? "text-foreground" : "text-muted-foreground"
                }
              >
                {label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
