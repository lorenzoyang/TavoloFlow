import { Button } from "@/components/ui/button";

type FilterChip = { value: string; label: string; lang?: string };

// A single-choice filter that scrolls sideways instead of wrapping into several rows on phones.
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
      className="flex gap-2 overflow-x-auto py-1 scrollbar-none [&::-webkit-scrollbar]:hidden"
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
