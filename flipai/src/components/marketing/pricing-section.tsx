import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PricingCard } from "@/components/ui/pricing-card";
import { PLAN_LIST } from "@/lib/billing/plans";

export function PricingSection({ compact = false }: { compact?: boolean }) {
  return (
    <section id="pricing" className="container py-16 sm:py-20">
      {!compact && (
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            מסלול לכל מוכר
          </h2>
          <p className="mt-3 text-muted-foreground">
            התחילו בחינם. שדרגו כשתרצו יותר. בלי התחייבות.
          </p>
        </div>
      )}
      <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-3 md:items-center">
        {PLAN_LIST.map((plan) => (
          <PricingCard
            key={plan.id}
            name={plan.name}
            price={plan.price}
            tagline={plan.tagline}
            features={plan.features}
            featured={plan.featured}
            cta={
              <Link href="/signup" className="block">
                <Button
                  className="w-full"
                  variant={plan.featured ? "primary" : "outline"}
                >
                  {plan.price === 0 ? "התחילו בחינם" : `בחרו ${plan.name}`}
                </Button>
              </Link>
            }
          />
        ))}
      </div>
    </section>
  );
}
