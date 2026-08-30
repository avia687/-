import type { Condition, Estimate } from "@/lib/ai/types";
import { clamp } from "@/lib/utils";

/**
 * Market Value Engine
 * -------------------
 * Turns a raw AI value estimate into an actionable pricing strategy and a
 * deal score. This is intentionally separate from the AI layer so that real
 * marketplace data sources (yad2, Facebook Marketplace, eBay sold-listings…)
 * can be plugged in later to replace or blend with the AI estimate.
 *
 * Every value produced here is an AI-derived ESTIMATE — never real
 * transaction data — and is surfaced in the UI as "שווי משוער ע"י AI".
 */

export type MarketResult = {
  source: "ai_estimated";
  estimatedValue: number;
  lowRange: number;
  highRange: number;
  recommendedPrice: number;
  quickSalePrice: number;
  maxPrice: number;
  confidence: number;
  demandScore: number;
  dealScore: number;
  scorePrice: number;
  scoreCondition: number;
  scoreDemand: number;
  scoreResale: number;
};

export const conditionFactor: Record<Condition, number> = {
  new: 1.0,
  like_new: 0.95,
  good: 0.85,
  fair: 0.72,
  worn: 0.58,
};

const conditionScore: Record<Condition, number> = {
  new: 9.6,
  like_new: 9.0,
  good: 7.8,
  fair: 6.2,
  worn: 4.6,
};

function round(value: number, step = 10) {
  return Math.max(step, Math.round(value / step) * step);
}

export function computeMarket(
  estimate: Estimate,
  condition: Condition,
): MarketResult {
  const base = estimate.estimatedValue;
  const confidence = clamp(Math.round(estimate.confidence), 40, 99);
  const demand = clamp(Math.round(estimate.demandScore), 0, 100);

  // Confidence widens/narrows the range. Lower confidence => wider band.
  const spread = clamp((100 - confidence) / 100, 0.06, 0.28);

  const lowRange = round(base * (1 - spread));
  const highRange = round(base * (1 + spread));

  // Recommended list price sits slightly above the estimate; demand nudges it.
  const demandLift = 1 + (demand - 50) / 500; // ±10%
  const recommendedPrice = round(base * 1.03 * demandLift);
  const quickSalePrice = round(base * 0.9);
  const maxPrice = round(highRange * 1.02);

  // Deal-score breakdown (0-10)
  const cond = condition;
  const scoreCondition = conditionScore[cond];
  const scoreDemand = clamp((demand / 100) * 10, 0, 10);
  // Price attractiveness: how much room there is between quick-sale and max.
  const margin = (maxPrice - quickSalePrice) / Math.max(quickSalePrice, 1);
  const scorePrice = clamp(5.5 + margin * 12, 3, 9.8);
  // Resale potential blends demand, condition and confidence.
  const scoreResale = clamp(
    scoreDemand * 0.5 + (scoreCondition / 10) * 4 + (confidence / 100) * 1.5,
    2,
    9.9,
  );

  const dealScore =
    Math.round(
      (scorePrice * 0.3 +
        scoreCondition * 0.25 +
        scoreDemand * 0.25 +
        scoreResale * 0.2) *
        10,
    ) / 10;

  return {
    source: "ai_estimated",
    estimatedValue: round(base),
    lowRange,
    highRange,
    recommendedPrice,
    quickSalePrice,
    maxPrice,
    confidence,
    demandScore: demand,
    dealScore,
    scorePrice: Math.round(scorePrice * 10) / 10,
    scoreCondition: Math.round(scoreCondition * 10) / 10,
    scoreDemand: Math.round(scoreDemand * 10) / 10,
    scoreResale: Math.round(scoreResale * 10) / 10,
  };
}

/** Human label for a deal score. */
export function dealScoreLabel(score: number): string {
  if (score >= 8.5) return "הזדמנות מצוינת";
  if (score >= 7) return "עסקה טובה";
  if (score >= 5.5) return "סבירה";
  return "מוגבלת";
}
