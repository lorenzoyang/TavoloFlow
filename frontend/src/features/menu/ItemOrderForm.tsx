import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DishPrice } from "@/components/dish-price";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { displayName, type Language } from "@/lib/language";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import type { Category, MenuItem } from "./api";
import { menuMessages } from "./messages";
import { dishPriceCents } from "@/features/orders/options";

export type ItemOrderSnapshot = {
  category: Category;
  defaultLanguage: Language;
  items: MenuItem[];
};

export function ItemOrderForm({
  initial,
  busy,
  save,
  cancel,
  feedback,
}: {
  initial: ItemOrderSnapshot;
  busy: boolean;
  save: (ids: string[]) => void;
  cancel: () => void;
  feedback: ReactNode;
}) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  const [items, setItems] = useState(initial.items);
  const changed = items.some((item, index) => item.id !== initial.items[index]?.id);

  function move(index: number, by: number) {
    if (busy || index + by < 0 || index + by >= items.length) return;
    const next = [...items];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setItems(next);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || !changed) return;
        save(items.map((item) => item.id));
      }}
    >
      <div>
        <h3 className="font-semibold wrap-break-word">
          {displayName(initial.category, initial.defaultLanguage, language).text}
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{m.itemOrderHint}</p>
      </div>
      {feedback}
      <ol className="divide-y">
        {items.map((item, index) => {
          const name = displayName(item, initial.defaultLanguage, language).text;
          return (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium wrap-break-word">{name}</p>
                <DishPrice
                  className="text-sm text-muted-foreground"
                  regular={
                    item.salePriceCents === null ? null : formatMoney(item.priceCents, language)
                  }
                  regularLabel={m.regularPrice}
                >
                  {formatMoney(dishPriceCents(item), language)}
                </DishPrice>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={m.moveUp(name)}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={m.moveDown(name)}
                  disabled={busy || index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="sticky bottom-0 flex gap-3 bg-background py-4 pb-safe">
        <Button type="submit" disabled={busy || !changed}>
          {busy ? m.saving : m.save}
        </Button>
        <Button variant="outline" disabled={busy} onClick={cancel}>
          {m.cancel}
        </Button>
      </div>
    </form>
  );
}
