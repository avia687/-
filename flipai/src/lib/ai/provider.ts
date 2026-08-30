import type {
  AnalyzeInput,
  Identification,
  ListingContent,
  NegotiationResult,
  ProductAnalysis,
} from "@/lib/ai/types";

export type ListingContext = {
  identification: Identification;
  recommendedPrice: number;
  quickSalePrice: number;
  maxPrice: number;
  note?: string;
  /** Seed to vary regenerated output. */
  variant?: number;
};

export type NegotiationContext = {
  productName: string;
  listedPrice: number;
  minPrice: number;
  buyerMessage: string;
};

export interface AIProvider {
  readonly name: "mock" | "openai";
  /** Identify product, estimate value, and draft a listing in one pass. */
  analyzeProduct(input: AnalyzeInput): Promise<ProductAnalysis>;
  /** Re-draft a listing (used by the "regenerate" action). */
  generateListing(ctx: ListingContext): Promise<ListingContent>;
  /** Produce three buyer-reply options for a pasted message. */
  negotiate(ctx: NegotiationContext): Promise<NegotiationResult>;
}
