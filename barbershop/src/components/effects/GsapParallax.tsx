"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * GSAP + ScrollTrigger powered parallax. Registered lazily on the client so
 * it never runs during SSR. Honors prefers-reduced-motion.
 */
export function GsapParallax({
  children,
  className,
  yPercent = -18,
}: {
  children: React.ReactNode;
  className?: string;
  yPercent?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ctx: { revert: () => void } | undefined;
    let active = true;

    (async () => {
      const gsapMod = await import("gsap");
      const stMod = await import("gsap/ScrollTrigger");
      if (!active) return;
      const gsap = gsapMod.default ?? gsapMod;
      const ScrollTrigger = stMod.ScrollTrigger ?? stMod.default;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        gsap.fromTo(
          el,
          { yPercent: -yPercent },
          {
            yPercent,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          },
        );
      });
    })();

    return () => {
      active = false;
      ctx?.revert();
    };
  }, [yPercent]);

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
