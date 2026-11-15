import { useId, useState } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayName } from "@/lib/language";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import type { Menu } from "./api";
import { menuMessages } from "./messages";

export function CategoryOrder({
  menu,
  disabled,
  move,
}: {
  menu: Menu;
  disabled: boolean;
  move: (index: number, by: number) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const language = useStaffLanguage();
  const m = menuMessages[language];
  if (menu.categories.length < 2) return null;
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <ArrowDownUp />
        {m.sortCategories}
      </Button>
      {open && (
        <section
          id={id}
          aria-labelledby={`${id}-title`}
          className="rounded-2xl border bg-card p-4 shadow-xs"
        >
          <h2 id={`${id}-title`} className="font-semibold">
            {m.sortCategories}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{m.categoryOrderHint}</p>
          <ol className="mt-3 divide-y">
            {menu.categories.map((category, index) => {
              const name = displayName(category, menu.defaultLanguage, language).text;
              return (
                <li key={category.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 text-sm font-medium wrap-break-word">{name}</span>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={m.moveUp(name)}
                      disabled={disabled || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={m.moveDown(name)}
                      disabled={disabled || index === menu.categories.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
