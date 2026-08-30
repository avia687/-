"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ImageIcon, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { cn, formatILS, formatRelativeHe } from "@/lib/utils";

export type ProductSummary = {
  id: string;
  name: string;
  status: string;
  imageUrl?: string | null;
  estimatedValue?: number | null;
  recommendedPrice?: number | null;
  dealScore?: number | null;
  createdAt: string | Date;
};

function scoreTone(score: number) {
  if (score >= 8) return "text-success";
  if (score >= 6) return "text-primary";
  if (score >= 4) return "text-warning";
  return "text-destructive";
}

/** Compact horizontal row (dashboard "recent" list). */
export function ProductRow({ product }: { product: ProductSummary }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-card"
    >
      <Thumb url={product.imageUrl} className="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">{product.name}</p>
          <StatusBadge status={product.status} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatRelativeHe(product.createdAt)}
        </p>
      </div>
      <div className="text-left">
        {typeof product.recommendedPrice === "number" && (
          <p className="num font-display font-bold">
            {formatILS(product.recommendedPrice)}
          </p>
        )}
        {typeof product.dealScore === "number" && (
          <p
            className={cn(
              "num text-xs font-semibold",
              scoreTone(product.dealScore),
            )}
          >
            {product.dealScore.toFixed(1)}/10
          </p>
        )}
      </div>
    </Link>
  );
}

/** Grid card (product library). */
export function ProductGridCard({
  product,
  index = 0,
}: {
  product: ProductSummary;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
    >
      <Link
        href={`/products/${product.id}`}
        className="group block overflow-hidden rounded-xl border bg-card transition-all hover:shadow-card"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <Thumb url={product.imageUrl} className="h-full w-full rounded-none" />
          <div className="absolute right-2 top-2">
            <StatusBadge status={product.status} />
          </div>
        </div>
        <div className="p-3.5">
          <p className="truncate font-semibold">{product.name}</p>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">מחיר מומלץ</p>
              <p className="num font-display text-lg font-bold">
                {typeof product.recommendedPrice === "number"
                  ? formatILS(product.recommendedPrice)
                  : "—"}
              </p>
            </div>
            {typeof product.dealScore === "number" && (
              <div
                className={cn(
                  "inline-flex items-center gap-1 text-sm font-bold",
                  scoreTone(product.dealScore),
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="num">{product.dealScore.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function Thumb({
  url,
  className,
}: {
  url?: string | null;
  className?: string;
}) {
  if (!url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg bg-muted text-muted-foreground",
          className,
        )}
      >
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className={cn("rounded-lg object-cover", className)}
      loading="lazy"
    />
  );
}
