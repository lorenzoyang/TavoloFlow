import { UtensilsCrossed } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

// The same mark as public/favicon.svg.
export function BrandMark({ caption, className }: { caption?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <UtensilsCrossed aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block font-display text-xl font-semibold tracking-tight">
          {PRODUCT_NAME}
        </span>
        {caption && <span className="block text-xs text-muted-foreground">{caption}</span>}
      </span>
    </div>
  );
}
