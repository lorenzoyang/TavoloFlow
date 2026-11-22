import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FilterChip = { value: string; label: string; lang?: string };

// A single-choice filter. Phones swipe one row sideways instead of wrapping into several rows;
// wide screens normally wrap it. Menus with a separate directory can keep one row at every width.
export function FilterChips({
  label,
  items,
  value,
  onChange,
  className,
  singleRow = false,
  viewportRef,
  contentRef,
}: {
  label: string;
  items: FilterChip[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  singleRow?: boolean;
  viewportRef?: Ref<HTMLElement>;
  contentRef?: Ref<HTMLDivElement>;
}) {
  const chips = items.map((item) => {
    const pressed = item.value === value;
    return (
      <Button
        key={item.value}
        variant={pressed ? "default" : "outline"}
        aria-pressed={pressed}
        lang={item.lang}
        className="rounded-full"
        onClick={() => onChange(item.value)}
      >
        <span className={cn("truncate", singleRow ? "max-w-[min(14rem,40vw)]" : "max-w-56")}>
          {item.label}
        </span>
      </Button>
    );
  });
  return (
    <nav
      ref={viewportRef}
      aria-label={label}
      className={cn(
        "overflow-x-auto py-1 scrollbar-none [&::-webkit-scrollbar]:hidden",
        singleRow ? "min-w-0 flex-1" : "flex gap-2 lg:flex-wrap lg:overflow-visible",
        className,
      )}
    >
      {singleRow ? (
        <div ref={contentRef} className="flex w-max gap-2 px-1">
          {chips}
        </div>
      ) : (
        chips
      )}
    </nav>
  );
}
