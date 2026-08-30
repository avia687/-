import { z } from "zod";

export const CATEGORIES = [
  "electronics",
  "vehicles",
  "fashion",
  "furniture",
  "collectibles",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONDITIONS = ["new", "like_new", "good", "fair", "worn"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const categoryLabels: Record<Category, string> = {
  electronics: "אלקטרוניקה",
  vehicles: "רכב",
  fashion: "אופנה",
  furniture: "ריהוט",
  collectibles: "אספנות",
  other: "אחר",
};

export const conditionLabels: Record<Condition, string> = {
  new: "חדש באריזה",
  like_new: "כמו חדש",
  good: "מצב טוב",
  fair: "מצב סביר",
  worn: "משומש",
};

/** Input to an analysis request. */
export const analyzeInputSchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  condition: z.enum(CONDITIONS).optional(),
  note: z.string().max(400).optional(),
  // Stable identifiers for the uploaded images (used to seed deterministic
  // mock output and, for the real provider, to reference stored files).
  imageRefs: z.array(z.string()).min(1, "יש להעלות לפחות תמונה אחת").max(6),
});
export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;

/** What the model believes the product is. */
export const identificationSchema = z.object({
  name: z.string(),
  category: z.enum(CATEGORIES),
  brand: z.string().optional(),
  model: z.string().optional(),
  year: z.string().optional(),
  condition: z.enum(CONDITIONS),
});
export type Identification = z.infer<typeof identificationSchema>;

/** Raw value estimate produced by the AI (before market normalization). */
export const estimateSchema = z.object({
  estimatedValue: z.number().positive(),
  confidence: z.number().min(0).max(100),
  demandScore: z.number().min(0).max(100),
  reasoning: z.string(),
});
export type Estimate = z.infer<typeof estimateSchema>;

/** Generated marketplace listing. */
export const listingSchema = z.object({
  title: z.string(),
  description: z.string(),
  details: z.record(z.string()),
  strategy: z.string(),
  startPrice: z.number().nonnegative(),
  expectedPrice: z.number().nonnegative(),
  minPrice: z.number().nonnegative(),
});
export type ListingContent = z.infer<typeof listingSchema>;

/** Buyer-negotiation response options. */
export const negotiationSchema = z.object({
  friendly: z.string(),
  firm: z.string(),
  quick: z.string(),
});
export type NegotiationResult = z.infer<typeof negotiationSchema>;

/** Full product analysis returned by the provider (pre-market-engine). */
export const productAnalysisSchema = z.object({
  identification: identificationSchema,
  estimate: estimateSchema,
  listing: listingSchema,
});
export type ProductAnalysis = z.infer<typeof productAnalysisSchema>;
