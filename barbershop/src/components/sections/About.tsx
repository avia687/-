"use client";

import { Award, Clock, Crown, Check } from "lucide-react";
import { Reveal } from "@/components/effects/Reveal";
import { Parallax } from "@/components/effects/Parallax";
import { SmartImage } from "@/components/shared/SmartImage";
import { Badge } from "@/components/ui/badge";
import { site } from "@/lib/site";

const features = [
  "צוות ספרים מוסמך ומנוסה",
  "כלים סטריליים ומוצרי פרימיום",
  "אווירה יוקרתית עם קפה ומוזיקה",
  "התאמה אישית לכל לקוח",
];

const pillars = [
  { icon: Crown, title: "יוקרה", text: "חוויה ברמת מלון בוטיק" },
  { icon: Award, title: "מקצועיות", text: "מאסטרים בעלי שם" },
  { icon: Clock, title: "דייקנות", text: "תמיד בזמן, בלי המתנות" },
];

export function About() {
  return (
    <section id="about" className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 bg-radial-fade opacity-60" />
      <div className="container-edge relative grid items-center gap-14 lg:grid-cols-2">
        {/* Images */}
        <div className="relative order-last grid grid-cols-5 grid-rows-6 gap-4 lg:order-first lg:h-[560px]">
          <Parallax speed={-30} className="col-span-3 row-span-4 h-72 lg:h-auto">
            <div className="card-lux h-full">
              <SmartImage
                src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=900&q=80"
                alt="פנים המספרה היוקרתית"
                fallbackLabel={site.nameEn}
                sizes="(max-width: 1024px) 60vw, 30vw"
              />
            </div>
          </Parallax>
          <Parallax
            speed={40}
            className="col-span-2 col-start-4 row-span-3 row-start-3 h-56 lg:h-auto"
          >
            <div className="card-lux h-full">
              <SmartImage
                src="https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=700&q=80"
                alt="ספר בעבודה"
                fallbackLabel="✁"
                sizes="(max-width: 1024px) 40vw, 20vw"
              />
            </div>
          </Parallax>
          {/* Floating experience badge */}
          <Reveal
            direction="scale"
            delay={0.2}
            className="absolute bottom-4 left-2 z-10 lg:left-0"
          >
            <div className="glass-strong flex items-center gap-3 rounded-2xl px-5 py-4 shadow-gold">
              <span className="font-display text-4xl font-bold text-gold-gradient">
                12+
              </span>
              <span className="text-sm leading-tight text-foreground/80">
                שנות
                <br />
                מצוינות
              </span>
            </div>
          </Reveal>
        </div>

        {/* Copy */}
        <div className="flex flex-col gap-6 text-right">
          <Reveal direction="up">
            <Badge>הסיפור שלנו</Badge>
          </Reveal>
          <Reveal direction="up" delay={0.05}>
            <h2 className="font-display text-3xl font-bold leading-tight text-balance sm:text-4xl md:text-5xl">
              לא רק תספורת —{" "}
              <span className="text-gold-gradient">חוויה שלמה</span>
            </h2>
          </Reveal>
          <Reveal direction="up" delay={0.1}>
            <p className="text-pretty leading-relaxed text-muted-foreground">
              ב{site.name} אנחנו מאמינים שתספורת היא הרבה מעבר לשגרה. מהרגע שאתה
              נכנס, אתה נכנס לעולם של דיוק, יוקרה ותשומת לב לכל פרט. הברברשופ נולד
              מתוך אהבה לאומנות הספרות הקלאסית, בשילוב הטרנדים המודרניים ביותר.
            </p>
          </Reveal>
          <Reveal direction="up" delay={0.15}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-3.5" />
                  </span>
                  <span className="text-foreground/85">{f}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal direction="up" delay={0.2}>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              {pillars.map((p) => (
                <div
                  key={p.title}
                  className="card-lux flex flex-col gap-1 p-5 transition-transform duration-500 hover:-translate-y-1"
                >
                  <p.icon className="mb-1 size-6 text-primary" />
                  <span className="font-display font-semibold">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{p.text}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
