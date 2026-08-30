export type PlanId = "free" | "pro" | "seller";

export type Plan = {
  id: PlanId;
  name: string;
  price: number; // ₪ / month
  tagline: string;
  /** Monthly analysis allowance. null = effectively unlimited. */
  monthlyAnalyses: number | null;
  features: string[];
  featured?: boolean;
  /** Env var name holding the Stripe price id (for real billing). */
  stripePriceEnv?: string;
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "חינם",
    price: 0,
    tagline: "להתחיל למכור חכם",
    monthlyAnalyses: 5,
    features: [
      "5 ניתוחי מוצר בחודש",
      "הערכת שווי מבוססת AI",
      "יצירת מודעה בסיסית",
      "ספריית מוצרים",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 39,
    tagline: "למוכרים קבועים",
    monthlyAnalyses: 300,
    featured: true,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    features: [
      "ניתוחים ללא הגבלה מעשית",
      "תמחור מתקדם וטווחי שוק",
      "עוזר משא-ומתן חכם",
      "יצירת מודעה מלאה + אסטרטגיה",
      "עיבוד AI בעדיפות",
    ],
  },
  seller: {
    id: "seller",
    name: "Seller",
    price: 79,
    tagline: "למוכרים תכופים ועסקים",
    monthlyAnalyses: null,
    stripePriceEnv: "STRIPE_PRICE_SELLER",
    features: [
      "כל מה שב-Pro",
      "מכסה גבוהה במיוחד",
      "אנליטיקות מתקדמות",
      "ניתוח מרובה מוצרים",
      "כלי מכירה מתקדמים",
    ],
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.pro, PLANS.seller];

export function planLabel(id: string): string {
  return PLANS[id as PlanId]?.name ?? "חינם";
}

export function monthlyLimit(id: string): number | null {
  return PLANS[id as PlanId]?.monthlyAnalyses ?? 5;
}
