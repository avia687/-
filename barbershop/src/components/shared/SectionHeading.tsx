"use client";

import { Reveal } from "@/components/effects/Reveal";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  align?: "center" | "start";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center" : "items-start text-right",
        className,
      )}
    >
      {eyebrow ? (
        <Reveal direction="up">
          <span className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            <span className="h-px w-8 bg-primary/60" />
            {eyebrow}
            <span className="h-px w-8 bg-primary/60" />
          </span>
        </Reveal>
      ) : null}

      <Reveal direction="up" delay={0.06}>
        <h2 className="font-display text-3xl font-bold leading-tight text-balance sm:text-4xl md:text-5xl">
          {title}
        </h2>
      </Reveal>

      {description ? (
        <Reveal direction="up" delay={0.12}>
          <p
            className={cn(
              "max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg",
              align === "center" ? "mx-auto" : "",
            )}
          >
            {description}
          </p>
        </Reveal>
      ) : null}
    </div>
  );
}
