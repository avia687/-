import { prisma } from "@/lib/db";
import type { ProductSummary } from "@/components/ui/product-card";

type ProductWithRels = {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  images: { thumbUrl: string | null; url: string }[];
  analysis: {
    estimatedValue: number;
    recommendedPrice: number;
    dealScore: number;
  } | null;
};

export function toSummary(p: ProductWithRels): ProductSummary {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    imageUrl: p.images[0]?.thumbUrl ?? p.images[0]?.url ?? null,
    estimatedValue: p.analysis?.estimatedValue ?? null,
    recommendedPrice: p.analysis?.recommendedPrice ?? null,
    dealScore: p.analysis?.dealScore ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function getDashboardData(userId: string) {
  const [products, agg, activeCount, subscription] = await Promise.all([
    prisma.product.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        analysis: true,
      },
    }),
    prisma.analysis.aggregate({
      where: { product: { userId } },
      _sum: { estimatedValue: true, recommendedPrice: true, quickSalePrice: true },
      _count: true,
    }),
    prisma.product.count({ where: { userId, status: "active" } }),
    prisma.subscription.findUnique({ where: { userId } }),
  ]);

  const totalValue = agg._sum.estimatedValue ?? 0;
  // Potential profit ~ spread between recommended and quick-sale across items.
  const potentialProfit =
    (agg._sum.recommendedPrice ?? 0) - (agg._sum.quickSalePrice ?? 0);

  return {
    recent: products.map((p) => toSummary(p as ProductWithRels)),
    analyzedCount: agg._count,
    totalValue,
    activeCount,
    potentialProfit,
    plan: subscription?.plan ?? "free",
  };
}
