"use client";

import * as React from "react";
import { SmartImage } from "@/components/shared/SmartImage";
import { cn } from "@/lib/utils";

interface BeforeAfterProps {
  before: string;
  after: string;
  alt: string;
  className?: string;
  sizes?: string;
}

/**
 * Accessible before/after comparison slider. Drag the handle (or use the
 * range input with the keyboard) to reveal the transformation.
 */
export function BeforeAfter({
  before,
  after,
  alt,
  className,
  sizes,
}: BeforeAfterProps) {
  const [value, setValue] = React.useState(50);

  return (
    <div
      className={cn(
        "group relative select-none overflow-hidden rounded-2xl",
        className,
      )}
    >
      {/* After (full) */}
      <SmartImage
        src={after}
        alt={`${alt} — אחרי`}
        fallbackLabel="אחרי"
        sizes={sizes}
        className="absolute inset-0"
      />

      {/* Before (clipped to the left portion) */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}
      >
        <SmartImage
          src={before}
          alt={`${alt} — לפני`}
          fallbackLabel="לפני"
          sizes={sizes}
          className="absolute inset-0 saturate-50"
        />
      </div>

      {/* Labels */}
      <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white/90 backdrop-blur">
        לפני
      </span>
      <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-primary/80 px-2.5 py-1 text-[11px] font-medium tracking-wide text-primary-foreground backdrop-blur">
        אחרי
      </span>

      {/* Divider + handle */}
      <div
        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-gold-gradient"
        style={{ left: `${value}%` }}
      >
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 grid size-9 place-items-center rounded-full border border-primary bg-background/90 shadow-gold">
          <span className="text-[10px] text-primary">◀ ▶</span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label={`${alt} — החלקה בין לפני לאחרי`}
        className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
