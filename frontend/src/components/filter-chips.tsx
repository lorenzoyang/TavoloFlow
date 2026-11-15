import { Button } from "@/components/ui/button";

type FilterChip = { value: string; label: string; lang?: string };

// A single-choice filter. Phones swipe one row sideways instead of wrapping into several rows;
// wide screens wrap it, because a mouse wheel cannot scroll a row sideways.
export function FilterChips({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: FilterChip[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <nav
      aria-label={label}
      className="flex gap-2 overflow-x-auto py-1 scrollbar-none lg:flex-wrap lg:overflow-visible [&::-webkit-scrollbar]:hidden"
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
