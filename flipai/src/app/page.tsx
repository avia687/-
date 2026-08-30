import Link from "next/link";
import {
  Sparkles,
  Camera,
  TrendingUp,
  MessageSquare,
  FileText,
  ShieldCheck,
  ArrowLeft,
  Star,
  Zap,
  Target,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FAQ } from "@/components/marketing/faq";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: Camera,
    title: "זיהוי מוצר מיידי",
    desc: "ה-AI מזהה מהתמונה מה המוצר, הדגם והמצב — בלי להקליד כלום.",
  },
  {
    icon: TrendingUp,
    title: "תמחור שוק חכם",
    desc: "שווי משוער, טווח מחירים ומחיר מומלץ — לפי ביקוש ומצב אמיתי.",
  },
  {
    icon: FileText,
    title: "מודעה מוכנה",
    desc: "כותרת, תיאור מקצועי ואסטרטגיית מכירה — מוכן להעתקה ולפרסום.",
  },
  {
    icon: MessageSquare,
    title: "עוזר משא ומתן",
    desc: "הדביקו הודעה מקונה וקבלו שלוש תשובות חכמות שסוגרות עסקה.",
  },
];

const steps = [
  { n: "1", title: "מעלים תמונה", desc: "גוררים תמונה אחת או כמה — או מצלמים ישר מהנייד." },
  { n: "2", title: "ה-AI מנתח", desc: "זיהוי, הערכת שווי, ציון עסקה ומודעה — תוך שניות." },
  { n: "3", title: "מוכרים חכם", desc: "מעתיקים את המודעה, מפרסמים, ומקבלים יותר כסף מהר יותר." },
];

const testimonials = [
  {
    name: "מאיה ל.",
    role: "מוכרת אלקטרוניקה",
    text: "מכרתי אייפון תוך יומיים ב-300 ₪ יותר ממה שתכננתי לבקש. המודעה נראתה מקצועית בטירוף.",
  },
  {
    name: "יוסי ק.",
    role: "מפנה דירה",
    text: "העליתי 12 פריטי ריהוט בערב אחד. התמחור חסך לי המון התלבטות.",
  },
  {
    name: "נועה ב.",
    role: "אספנית",
    text: "עוזר המשא-ומתן פשוט גאוני. הפסקתי להתווכח ופשוט סוגרת עסקאות.",
  },
];

export default function LandingPage() {
  return (
    <>
      <MarketingHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(60%_50%_at_50%_0%,black,transparent)]" />
          <div className="container relative py-16 text-center sm:py-24">
            <div className="animate-fade-up">
              <Badge variant="primary" className="mb-5">
                <Sparkles className="h-3.5 w-3.5" />
                בינה מלאכותית למוכרים ביד שנייה
              </Badge>
            </div>
            <h1 className="mx-auto max-w-3xl text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight animate-fade-up sm:text-6xl">
              תמכרו{" "}
              <span className="bg-gradient-to-l from-primary to-fuchsia-500 bg-clip-text text-transparent">
                חכם
              </span>{" "}
              עם AI
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted-foreground animate-fade-up">
              העלו מוצר. קבלו את המחיר הנכון, מודעה טובה יותר וכל מה שצריך כדי
              למכור מהר יותר — בפחות מדקה.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-fade-up">
              <Link href="/signup">
                <Button size="lg" className="text-base">
                  <Sparkles className="h-4 w-4" />
                  נתחו מוצר
                </Button>
              </Link>
              <a href="#how">
                <Button size="lg" variant="outline" className="text-base">
                  איך זה עובד
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              חינם להתחלה · 5 ניתוחים ראשונים · בלי כרטיס אשראי
            </p>

            {/* Result preview */}
            <HeroPreview />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="container py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              ממוצר למודעה מקצועית — בפחות מדקה
            </h2>
            <p className="mt-3 text-muted-foreground">שלושה צעדים. אפס כאב ראש.</p>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl gap-5 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="rounded-2xl border bg-card p-6 text-center shadow-soft">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary font-display text-lg font-extrabold text-primary-foreground">
                  {s.n}
                </span>
                <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-y bg-card/40">
          <div className="container py-16 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                כל מה שצריך כדי למכור טוב יותר
              </h2>
              <p className="mt-3 text-muted-foreground">
                לא עוד ניחושים על מחיר, לא עוד מודעות משעממות.
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="rounded-xl border bg-card p-5 shadow-soft">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-display text-base font-bold">{f.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="container py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              מוכרים כבר עובדים חכם
            </h2>
          </div>
          <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
            {testimonials.map((t) => (
              <figure key={t.name} className="rounded-2xl border bg-card p-6 shadow-soft">
                <div className="mb-3 flex gap-0.5 text-warning">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="text-sm leading-relaxed">
                  “{t.text}”
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
                    {t.name.charAt(0)}
                  </span>
                  <span className="text-sm">
                    <span className="block font-semibold">{t.name}</span>
                    <span className="block text-muted-foreground">{t.role}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <PricingSection />

        <FAQ />

        {/* Final CTA */}
        <section className="container pb-20">
          <div className="relative overflow-hidden rounded-3xl border bg-primary px-6 py-14 text-center text-primary-foreground shadow-accent">
            <div className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(50%_50%_at_50%_0%,white,transparent)]" />
            <h2 className="relative font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              דעו כמה המוצר שלכם שווה — לפני שאתם מוכרים
            </h2>
            <p className="relative mx-auto mt-3 max-w-lg opacity-90">
              הצטרפו בחינם והפכו את הפריט הבא שלכם למודעה מקצועית תוך דקה.
            </p>
            <div className="relative mt-7">
              <Link href="/signup">
                <Button
                  size="lg"
                  className="bg-white text-primary hover:bg-white/90 text-base"
                >
                  <Zap className="h-4 w-4" />
                  התחילו עכשיו — חינם
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}

function HeroPreview() {
  return (
    <div className="mx-auto mt-14 max-w-3xl animate-fade-up">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-lift">
        <div className="flex items-center gap-1.5 border-b bg-muted px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="ms-2 text-xs text-muted-foreground" dir="ltr">
            flipai.co/analyze
          </span>
        </div>
        <div className="grid gap-4 p-5 text-start sm:grid-cols-2">
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">שווי שוק משוער ע״י AI</p>
            <p className="num mt-1 font-display text-3xl font-extrabold">₪1,850</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { l: "מהיר", v: "₪1,690", icon: Zap },
                { l: "מומלץ", v: "₪1,900", icon: Target, feat: true },
                { l: "מקסימום", v: "₪2,100", icon: TrendingUp },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <div
                    key={t.l}
                    className={`rounded-lg border p-2 text-center ${
                      t.feat ? "border-primary bg-accent/60" : "bg-card"
                    }`}
                  >
                    <Icon className="mx-auto h-3.5 w-3.5 text-primary" />
                    <p className="num mt-1 text-sm font-bold">{t.v}</p>
                    <p className="text-[10px] text-muted-foreground">{t.l}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">ציון עסקה</span>
              <ShieldCheck className="h-4 w-4 text-success" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="num font-display text-4xl font-extrabold text-success">
                8.7
              </span>
              <span className="text-sm text-muted-foreground">/ 10</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">הזדמנות מצוינת</p>
            <div className="mt-3 space-y-1.5">
              {[
                ["מחיר", 90],
                ["ביקוש", 84],
                ["פוטנציאל", 81],
              ].map(([l, w]) => (
                <div key={l as string}>
                  <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
                    <span>{l}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
