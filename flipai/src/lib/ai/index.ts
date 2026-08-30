import type {
  AIProvider,
  ListingContext,
  NegotiationContext,
} from "@/lib/ai/provider";
import type {
  AnalyzeInput,
  ListingContent,
  NegotiationResult,
  ProductAnalysis,
} from "@/lib/ai/types";
import { MockAIProvider } from "@/lib/ai/mock";
import { OpenAIProvider } from "@/lib/ai/openai";

let mock: MockAIProvider | null = null;
let openai: OpenAIProvider | null = null;

function getMock() {
  return (mock ??= new MockAIProvider());
}

/** True when a real AI provider is configured. */
export function isRealAI() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function primary(): AIProvider {
  if (isRealAI()) return (openai ??= new OpenAIProvider());
  return getMock();
}

/**
 * Centralized AI service. Every AI call in the app goes through this object.
 * If the real provider errors or returns malformed data, we transparently
 * fall back to the deterministic mock so the product loop never breaks.
 */
export const aiService = {
  get providerName() {
    return primary().name;
  },

  async analyzeProduct(input: AnalyzeInput): Promise<ProductAnalysis> {
    const p = primary();
    if (p.name === "mock") return p.analyzeProduct(input);
    try {
      return await p.analyzeProduct(input);
    } catch (err) {
      console.error("[ai] analyzeProduct failed, using fallback:", err);
      return getMock().analyzeProduct(input);
    }
  },

  async generateListing(ctx: ListingContext): Promise<ListingContent> {
    const p = primary();
    if (p.name === "mock") return p.generateListing(ctx);
    try {
      return await p.generateListing(ctx);
    } catch (err) {
      console.error("[ai] generateListing failed, using fallback:", err);
      return getMock().generateListing(ctx);
    }
  },

  async negotiate(ctx: NegotiationContext): Promise<NegotiationResult> {
    const p = primary();
    if (p.name === "mock") return p.negotiate(ctx);
    try {
      return await p.negotiate(ctx);
    } catch (err) {
      console.error("[ai] negotiate failed, using fallback:", err);
      return getMock().negotiate(ctx);
    }
  },
};
