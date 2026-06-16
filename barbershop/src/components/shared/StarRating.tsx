import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  className,
  size = 16,
}: {
  value: number;
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="img"
      aria-label={`דירוג ${value} מתוך 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < Math.round(value);
        return (
          <Star
            key={i}
            width={size}
            height={size}
            className={cn(
              "transition-colors",
              filled ? "fill-primary text-primary" : "fill-transparent text-muted-foreground/40",
            )}
          />
        );
      })}
    </div>
  );
}
