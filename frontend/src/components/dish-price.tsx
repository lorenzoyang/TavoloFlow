import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A dish's price. While the dish is on sale, its regular price stands struck through before the sale
// price, with a hidden label so screen readers don't read two bare amounts. Guest and store pages pass
// the label in their own language; stacked puts the regular price on its own line for narrow columns.
export function DishPrice({
  children,
  regular,
  regularLabel,
  stacked = false,
  className,
}: {
  children: ReactNode;
  regular: string | null;
  regularLabel: string;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular-nums",
        stacked ? "flex flex-col items-end" : "inline-flex flex-wrap items-baseline gap-x-1.5",
        className,
      )}
    >
      {regular && (
        <s className="text-sm font-normal whitespace-nowrap text-muted-foreground">
          <span className="sr-only">{regularLabel} </span>
          {regular}
        </s>
      )}
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
}
