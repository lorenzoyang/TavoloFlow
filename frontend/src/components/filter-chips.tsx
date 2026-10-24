import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FilterChip = { value: string; label: string; lang?: string };

// A single-choice filter that scrolls sideways instead of wrapping into several rows on phones.
export function FilterChips({
  label,
  items,
  value,
  onChange,
  className,
}: {
  label: string;
  items: FilterChip[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
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
            <span className="max-w-56 truncate">{item.label}</span>
          </Button>
        );
      })}
    </nav>
  );
}
