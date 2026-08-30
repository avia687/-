import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser, ApiError } from "@/lib/session-guards";
import { handleApiError, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { assertCanAnalyze, incrementUsage } from "@/lib/usage";
import { processAndStore } from "@/lib/images";
import { aiService } from "@/lib/ai";
import { analyzeInputSchema, CATEGORIES, CONDITIONS } from "@/lib/ai/types";
import { computeMarket } from "@/lib/market/engine";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const metaSchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  condition: z.enum(CONDITIONS).optional(),
  note: z.string().max(400).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireApiUser();
    const userId = session.user.id;

    const rl = rateLimit(`analyze:${userId}`, 12, 60 * 1000);
    if (!rl.ok) {
      return jsonError(429, "יותר מדי בקשות. נסו שוב בעוד רגע.", "rate_limited");
    }

    // Enforce plan usage limit BEFORE doing any work.
    await assertCanAnalyze(userId);

    const formData = await req.formData();
    const files = formData
      .getAll("images")
      .filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) {
      return jsonError(422, "יש להעלות לפחות תמונה אחת", "no_images");
    }
    if (files.length > 6) {
      return jsonError(422, "ניתן להעלות עד 6 תמונות", "too_many");
    }

    const meta = metaSchema.parse({
      category: formData.get("category") || undefined,
      condition: formData.get("condition") || undefined,
      note: formData.get("note") || undefined,
    });

    // Store & optimize images.
    const stored = [];
    for (const file of files) {
      stored.push(await processAndStore(file));
    }

    track("analysis_started", { userId, images: stored.length });

    const input = analyzeInputSchema.parse({
      category: meta.category,
      condition: meta.condition,
      note: meta.note,
      imageRefs: stored.map((s) => s.url),
    });

    // AI analysis (real or mock, with graceful fallback).
    const analysis = await aiService.analyzeProduct(input);

    // Market engine derives pricing tiers + deal score.
    const market = computeMarket(
      analysis.estimate,
      meta.condition ?? analysis.identification.condition,
    );

    // Persist everything as one product.
    const product = await prisma.product.create({
      data: {
        userId,
        name: analysis.identification.name,
        category: analysis.identification.category,
        condition: analysis.identification.condition,
        status: "draft",
        images: {
          create: stored.map((s, i) => ({
            url: s.url,
            thumbUrl: s.thumbUrl,
            width: s.width,
            height: s.height,
            bytes: s.bytes,
            position: i,
          })),
        },
        analysis: {
          create: {
            estimatedValue: market.estimatedValue,
            lowRange: market.lowRange,
            highRange: market.highRange,
            recommendedPrice: market.recommendedPrice,
            quickSalePrice: market.quickSalePrice,
            maxPrice: market.maxPrice,
            confidence: market.confidence,
            demandScore: market.demandScore,
            dealScore: market.dealScore,
            scorePrice: market.scorePrice,
            scoreCondition: market.scoreCondition,
            scoreDemand: market.scoreDemand,
            scoreResale: market.scoreResale,
            source: market.source,
            reasoning: analysis.estimate.reasoning,
            rawJson: JSON.stringify(analysis),
          },
        },
        listing: {
          create: {
            title: analysis.listing.title,
            description: analysis.listing.description,
            detailsJson: JSON.stringify(analysis.listing.details),
            strategy: analysis.listing.strategy,
            startPrice: market.recommendedPrice,
            expectedPrice: analysis.listing.expectedPrice,
            minPrice: market.quickSalePrice,
          },
        },
      },
    });

    // Count usage only after a successful analysis.
    await incrementUsage(userId);
    track("analysis_completed", {
      userId,
      productId: product.id,
      provider: aiService.providerName,
    });

    return NextResponse.json({ ok: true, productId: product.id });
  } catch (err) {
    if (err instanceof ApiError && err.code === "limit_reached") {
      return jsonError(err.status, err.message, err.code);
    }
    return handleApiError(err);
  }
}
