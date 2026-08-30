import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-accent",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M7 4h10a1 1 0 0 1 1 1v3H6V5a1 1 0 0 1 1-1Z"
          fill="currentColor"
          opacity="0.55"
        />
        <path
          d="M6 10h12l-1.2 8.2A2 2 0 0 1 14.8 20H9.2a2 2 0 0 1-2-1.8L6 10Z"
          fill="currentColor"
        />
        <path
          d="m10.5 12.5 3 3m0-3-3 3"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function Logo({
  className,
  href = "/",
  withText = true,
}: {
  className?: string;
  href?: string;
  withText?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5", className)}
    >
      <LogoMark />
      {withText && (
        <span className="font-display text-lg font-extrabold tracking-tight">
          Flip<span className="text-primary">AI</span>
        </span>
      )}
    </Link>
  );
}
