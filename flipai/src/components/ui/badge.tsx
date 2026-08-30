import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        primary: "bg-accent text-accent-foreground",
        success:
          "bg-success/12 text-success dark:bg-success/20 dark:text-success",
        warning:
          "bg-warning/15 text-warning dark:bg-warning/20 dark:text-warning",
        destructive:
          "bg-destructive/12 text-destructive dark:bg-destructive/20",
        outline: "border border-border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

/** Maps a product status to a Hebrew label + badge variant. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps["variant"] }> =
    {
      active: { label: "פעיל", variant: "success" },
      sold: { label: "נמכר", variant: "primary" },
      draft: { label: "טיוטה", variant: "outline" },
    };
  const it = map[status] ?? { label: status, variant: "default" };
  return <Badge variant={it.variant}>{it.label}</Badge>;
}
