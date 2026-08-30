import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProductDetail } from "@/components/product/product-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    select: { name: true },
  });
  return { title: product?.name ?? "מוצר" };
}

export default async function ProductPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const product = await prisma.product.findFirst({
    where: { id: params.id, userId: session!.user.id },
    include: {
      images: { orderBy: { position: "asc" } },
      analysis: true,
      listing: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!product || !product.analysis || !product.listing) notFound();

  const details: Record<string, string> = safeParse(product.listing.detailsJson);
  const lastNegotiation = product.messages[0]
    ? {
        buyerMessage: product.messages[0].buyerMessage,
        responses: safeParse<{ friendly: string; firm: string; quick: string }>(
          product.messages[0].responsesJson,
        ),
      }
    : null;

  const data = {
    id: product.id,
    name: product.name,
    category: product.category,
    condition: product.condition,
    status: product.status,
    images: product.images.map((i) => ({ url: i.url, thumbUrl: i.thumbUrl })),
    analysis: {
      estimatedValue: product.analysis.estimatedValue,
      lowRange: product.analysis.lowRange,
      highRange: product.analysis.highRange,
      recommendedPrice: product.analysis.recommendedPrice,
      quickSalePrice: product.analysis.quickSalePrice,
      maxPrice: product.analysis.maxPrice,
      confidence: product.analysis.confidence,
      demandScore: product.analysis.demandScore,
      dealScore: product.analysis.dealScore,
      scorePrice: product.analysis.scorePrice,
      scoreCondition: product.analysis.scoreCondition,
      scoreDemand: product.analysis.scoreDemand,
      scoreResale: product.analysis.scoreResale,
      reasoning: product.analysis.reasoning,
    },
    listing: {
      title: product.listing.title,
      description: product.listing.description,
      details,
      strategy: product.listing.strategy,
      startPrice: product.listing.startPrice,
      minPrice: product.listing.minPrice,
    },
    lastNegotiation,
  };

  return <ProductDetail data={data} />;
}

function safeParse<T = Record<string, string>>(json: string | null): T {
  try {
    return json ? JSON.parse(json) : ({} as T);
  } catch {
    return {} as T;
  }
}
