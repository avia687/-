import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FAQ } from "@/components/marketing/faq";

export const metadata: Metadata = {
  title: "מחירים",
  description:
    "מסלול חינמי עם 5 ניתוחים בחודש, Pro ב-₪39 ו-Seller ב-₪79. בחרו את המסלול שמתאים לכם והתחילו למכור חכם.",
};

export default function PricingPage() {
  return (
    <>
      <MarketingHeader />
      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
          <div className="container relative pt-16 text-center">
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              תמחור פשוט ושקוף
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              התחילו בחינם, שדרגו כשתצטרכו יותר. אפשר לבטל בכל רגע.
            </p>
          </div>
        </section>
        <PricingSection compact />
        <FAQ />
      </main>
      <MarketingFooter />
    </>
  );
}
