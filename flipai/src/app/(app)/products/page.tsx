import Link from "next/link";
import type { Metadata } from "next";
import { Plus, PackageSearch } from "lucide-react";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toSummary } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { LibraryControls } from "@/components/product/library-controls";
import { ProductGridCard } from "@/components/ui/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "המוצרים שלי" };
export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  q?: string;
  sort?: string;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const userId = session!.user.id;

  const status = searchParams.status;
  const q = searchParams.q?.trim();
  const sort = searchParams.sort || "newest";

  const where: Prisma.ProductWhereInput = {
    userId,
    ...(status && ["active", "sold", "draft"].includes(status)
      ? { status }
      : {}),
    ...(q ? { name: { contains: q } } : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === "newest" ? { createdAt: "desc" } : { createdAt: "desc" };

  const [products, counts] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        analysis: true,
      },
    }),
    Promise.all([
      prisma.product.count({ where: { userId } }),
      prisma.product.count({ where: { userId, status: "active" } }),
      prisma.product.count({ where: { userId, status: "sold" } }),
      prisma.product.count({ where: { userId, status: "draft" } }),
    ]),
  ]);

  let summaries = products.map((p) => toSummary(p as never));

  // Sorts that depend on the analysis relation are applied in-memory.
  if (sort === "value") {
    summaries = summaries.sort(
      (a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0),
    );
  } else if (sort === "score") {
    summaries = summaries.sort((a, b) => (b.dealScore ?? 0) - (a.dealScore ?? 0));
  } else if (sort === "profit") {
    summaries = summaries.sort(
      (a, b) => (b.recommendedPrice ?? 0) - (a.recommendedPrice ?? 0),
    );
  }

  const [all, active, sold, draft] = counts;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="המוצרים שלי"
        subtitle="כל הניתוחים והמודעות במקום אחד"
        action={
          <Link href="/analyze">
            <Button>
              <Plus className="h-4 w-4" />
              מוצר חדש
            </Button>
          </Link>
        }
      />

      <LibraryControls counts={{ all, active, sold, draft }} />

      {summaries.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="h-6 w-6" />}
          title={q || status ? "לא נמצאו מוצרים" : "עדיין אין מוצרים"}
          description={
            q || status
              ? "נסו לשנות את החיפוש או הסינון."
              : "נתחו את המוצר הראשון שלכם והוא יופיע כאן."
          }
          action={
            !q && !status ? (
              <Link href="/analyze">
                <Button>
                  <Plus className="h-4 w-4" />
                  נתח מוצר
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {summaries.map((p, i) => (
            <ProductGridCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
