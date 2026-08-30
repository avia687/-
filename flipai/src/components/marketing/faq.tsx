"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    q: "איך FlipAI יודע כמה המוצר שלי שווה?",
    a: "מעלים תמונה, וה-AI מזהה את המוצר, הדגם והמצב, ומעריך שווי שוק על בסיס מודעות דומות וביקוש נוכחי. זו הערכה חכמה — לא נתון מכירה בפועל — ואנחנו תמיד מסמנים אותה כ״שווי משוער ע״י AI״.",
  },
  {
    q: "כמה זמן לוקח לקבל מודעה מוכנה?",
    a: "פחות מדקה. מהעלאת התמונה ועד כותרת, תיאור, תמחור ואסטרטגיית מכירה — הכל אוטומטי ומוכן להעתקה.",
  },
  {
    q: "האם אני חייב לשלם כדי להתחיל?",
    a: "לא. המסלול החינמי כולל 5 ניתוחים בחודש בלי כרטיס אשראי. משדרגים רק כשצריך יותר.",
  },
  {
    q: "לאילו קטגוריות זה מתאים?",
    a: "אלקטרוניקה, רכב, אופנה, ריהוט, אספנות ועוד. ה-AI מתמודד עם מגוון רחב של מוצרי יד-שנייה.",
  },
  {
    q: "מה זה עוזר משא ומתן?",
    a: "מדביקים הודעה שקיבלתם מקונה, ומקבלים שלוש תשובות מוכנות — ידידותית, תקיפה ולסגירה מהירה — כדי לענות מהר ולסגור עסקה.",
  },
];

export function FAQ() {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <section id="faq" className="container py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          שאלות נפוצות
        </h2>
      </div>
      <div className="mx-auto mt-8 max-w-2xl space-y-3">
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="overflow-hidden rounded-xl border bg-card">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start"
              >
                <span className="font-semibold">{item.q}</span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
