// Subscription plans + limit gating. No real billing here — this is the
// architecture a Stripe (or other) provider plugs into later. `assertWithinLimit`
// is the single gate used across API routes.

export const PLANS = ["free", "basic", "pro", "business"] as const;
export type Plan = (typeof PLANS)[number];

export type PlanDef = {
  key: Plan;
  label: string;
  priceMonthly: number; // ILS, display only
  limits: {
    customers: number; // -1 = unlimited
    jobsPerMonth: number;
    employees: number;
  };
  features: {
    ai: boolean;
    automations: boolean;
    whatsapp: boolean;
    advancedAnalytics: boolean;
    team: boolean;
  };
};

export const PLAN_DEFS: Record<Plan, PlanDef> = {
  free: {
    key: "free",
    label: "חינם",
    priceMonthly: 0,
    limits: { customers: 5, jobsPerMonth: 10, employees: 1 },
    features: { ai: false, automations: false, whatsapp: false, advancedAnalytics: false, team: false },
  },
  basic: {
    key: "basic",
    label: "בסיסי",
    priceMonthly: 49,
    limits: { customers: -1, jobsPerMonth: -1, employees: 2 },
    features: { ai: false, automations: false, whatsapp: false, advancedAnalytics: false, team: false },
  },
  pro: {
    key: "pro",
    label: "פרו",
    priceMonthly: 99,
    limits: { customers: -1, jobsPerMonth: -1, employees: 5 },
    features: { ai: true, automations: true, whatsapp: true, advancedAnalytics: false, team: false },
  },
  business: {
    key: "business",
    label: "עסקי",
    priceMonthly: 199,
    limits: { customers: -1, jobsPerMonth: -1, employees: -1 },
    features: { ai: true, automations: true, whatsapp: true, advancedAnalytics: true, team: true },
  },
};

export function planDef(plan: string): PlanDef {
  return PLAN_DEFS[(plan as Plan) in PLAN_DEFS ? (plan as Plan) : "free"];
}

export class LimitError extends Error {
  constructor(public limitKey: string, message: string) {
    super(message);
    this.name = "LimitError";
  }
}

/** Throws LimitError when `current` has reached the plan limit for `key`. */
export function assertWithinLimit(
  plan: string,
  key: keyof PlanDef["limits"],
  current: number,
) {
  const limit = planDef(plan).limits[key];
  if (limit !== -1 && current >= limit) {
    throw new LimitError(key, `הגעת למגבלת התוכנית (${limit}). שדרג/י כדי להוסיף עוד.`);
  }
}

export function hasFeature(plan: string, feature: keyof PlanDef["features"]): boolean {
  return planDef(plan).features[feature];
}
