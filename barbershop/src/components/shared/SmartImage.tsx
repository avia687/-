"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface SmartImageProps {
  src?: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Initials / short label shown on the fallback. */
  fallbackLabel?: string;
}

/**
 * next/image with a tasteful gradient fallback. If the remote photo is
 * missing or fails to load (e.g. offline), a branded charcoal/gold gradient
 * with a label is shown instead — so the layout never breaks.
 */
export function SmartImage({
  src,
  alt,
  className,
  sizes = "(max-width: 768px) 100vw, 33vw",
  priority,
  fallbackLabel,
}: SmartImageProps) {
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {/* Fallback layer (always rendered behind) */}
      <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(120%_120%_at_30%_0%,#1d1d20_0%,#0c0c0e_60%)]">
        <div className="absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(115deg,#d9a83f_0_1px,transparent_1px_16px)]" />
        {fallbackLabel ? (
          <span className="relative font-display text-3xl font-bold text-primary/40">
            {fallbackLabel}
          </span>
        ) : null}
      </div>

      {showImage ? (
        <Image
          src={src as string}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setFailed(true)}
          className="relative object-cover"
        />
      ) : null}
    </div>
  );
}
