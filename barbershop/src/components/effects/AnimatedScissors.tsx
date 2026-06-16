"use client";

import { cn } from "@/lib/utils";

/**
 * Stylised scissors that gently open and close. Used as a logo mark and as
 * a decorative divider. The two blades rotate around the shared pivot.
 */
export function AnimatedScissors({
  className,
  animate = true,
}: {
  className?: string;
  animate?: boolean;
}) {
  const pivot = { transformOrigin: "32px 38px" } as const;
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={cn("h-10 w-10", className)}
    >
      <defs>
        <linearGradient id="scissorGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f6ecca" />
          <stop offset="50%" stopColor="#e4be63" />
          <stop offset="100%" stopColor="#c8902a" />
        </linearGradient>
      </defs>

      {/* Top blade + ring */}
      <g
        style={pivot}
        className={animate ? "animate-scissor-top" : undefined}
      >
        <path
          d="M32 38 L54 9"
          stroke="url(#scissorGold)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle
          cx="19"
          cy="51"
          r="7"
          stroke="url(#scissorGold)"
          strokeWidth="3"
        />
      </g>

      {/* Bottom blade + ring */}
      <g
        style={pivot}
        className={animate ? "animate-scissor-bottom" : undefined}
      >
        <path
          d="M32 38 L10 9"
          stroke="url(#scissorGold)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle
          cx="45"
          cy="51"
          r="7"
          stroke="url(#scissorGold)"
          strokeWidth="3"
        />
      </g>

      {/* Pivot screw */}
      <circle cx="32" cy="38" r="2.6" fill="url(#scissorGold)" />
    </svg>
  );
}
