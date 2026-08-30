import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/session-guards";
import { handleApiError, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { aiService } from "@/lib/ai";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  productId: z.string().min(1),
  buyerMessage: z.string().trim().min(1, "יש להזין הודעה מהקונה").max(600),
});

export async function POST(req: Request) {
  try {
    const session = await requireApiUser();
    const userId = session.user.id;

    const rl = rateLimit(`negotiate:${userId}`, 25, 60 * 1000);
    if (!rl.ok) return jsonError(429, "יותר מדי בקשות. נסו שוב בעוד רגע.", "rate_limited");

    const { productId, buyerMessage } = schema.parse(await req.json());

    const product = await prisma.product.findFirst({
      where: { id: productId, userId },
      include: { listing: true, analysis: true },
    });
    if (!product) return jsonError(404, "המוצר לא נמצא", "not_found");

    const listedPrice =
      product.listing?.startPrice ??
      product.analysis?.recommendedPrice ??
      0;
    const minPrice =
      product.listing?.minPrice ?? product.analysis?.quickSalePrice ?? 0;

    const responses = await aiService.negotiate({
      productName: product.name,
      listedPrice,
      minPrice,
      buyerMessage,
    });

    await prisma.negotiationMessage.create({
      data: {
        productId,
        buyerMessage,
        responsesJson: JSON.stringify(responses),
      },
    });

    track("negotiation_generated", { userId, productId });
    return NextResponse.json({ ok: true, responses });
  } catch (err) {
    return handleApiError(err);
  }
}
