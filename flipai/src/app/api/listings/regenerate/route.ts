import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/session-guards";
import { handleApiError, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { aiService } from "@/lib/ai";
import { CONDITIONS, type Category, type Condition } from "@/lib/ai/types";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ productId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const session = await requireApiUser();
    const userId = session.user.id;

    const rl = rateLimit(`regen:${userId}`, 20, 60 * 1000);
    if (!rl.ok) return jsonError(429, "יותר מדי בקשות. נסו שוב בעוד רגע.", "rate_limited");

    const { productId } = schema.parse(await req.json());

    const product = await prisma.product.findFirst({
      where: { id: productId, userId },
      include: { analysis: true, listing: true },
    });
    if (!product || !product.analysis) {
      return jsonError(404, "המוצר לא נמצא", "not_found");
    }

    const condition = (
      CONDITIONS.includes(product.condition as Condition)
        ? product.condition
        : "good"
    ) as Condition;

    const listing = await aiService.generateListing({
      identification: {
        name: product.name,
        category: (product.category ?? "other") as Category,
        condition,
      },
      recommendedPrice: product.analysis.recommendedPrice,
      quickSalePrice: product.analysis.quickSalePrice,
      maxPrice: product.analysis.maxPrice,
      variant: Math.floor(Math.random() * 1000),
    });

    const saved = await prisma.generatedListing.update({
      where: { productId },
      data: {
        title: listing.title,
        description: listing.description,
        detailsJson: JSON.stringify(listing.details),
        strategy: listing.strategy,
        startPrice: listing.startPrice,
        expectedPrice: listing.expectedPrice,
        minPrice: listing.minPrice,
      },
    });

    track("listing_generated", { userId, productId });
    return NextResponse.json({ ok: true, listing: saved });
  } catch (err) {
    return handleApiError(err);
  }
}
