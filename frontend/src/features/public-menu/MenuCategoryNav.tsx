import { useLayoutEffect, useRef, useState, type Ref } from "react";
import { Check, List } from "lucide-react";
import { FilterChips, type FilterChip } from "@/components/filter-chips";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { orderMessages } from "@/features/orders/messages";
import type { Language } from "@/lib/language";
import { useHistorySheet } from "@/lib/useHistorySheet";
import { messages } from "./messages";

function selectedChip(viewport: HTMLElement | null) {
  return viewport?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
}

export function MenuCategoryNav({
  barRef,
  language,
  items,
  value,
  select,
}: {
  barRef: Ref<HTMLDivElement>;
  language: Language;
  items: FilterChip[];
  value: string;
  select: (id: string, focusHeading?: boolean) => void;
}) {
  const m = messages[language];
  const toolbar = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pendingSelection = useRef<string | null>(null);
  const [overflows, setOverflows] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const hasItems = items.length > 0;
  const sheet = useHistorySheet("categories", hasItems);

  useLayoutEffect(() => {
    const bar = toolbar.current;
    const rail = viewport.current;
    const row = content.current;
    if (!bar || !rail || !row) return;

    const measureScrollEdge = () => {
      setCanScrollRight(rail.scrollWidth - rail.clientWidth - Math.max(0, rail.scrollLeft) > 1);
    };
    const measure = () => {
      const available = bar.getBoundingClientRect().width;
      if (!available) return;
      // Compare with the whole toolbar, so showing the trigger cannot keep itself visible.
      setOverflows(row.getBoundingClientRect().width > available);

      const chip = selectedChip(rail)?.getBoundingClientRect();
      if (chip) {
        const bounds = rail.getBoundingClientRect();
        const left = bounds.left + 4;
        // Keep the selected label clear of the fade when bringing it into view.
        const right = bounds.right - 12;
        if (chip.left < left || chip.width > right - left) rail.scrollLeft += chip.left - left;
        else if (chip.right > right) rail.scrollLeft += chip.right - right;
      }
      measureScrollEdge();
    };

    measure();
    rail.addEventListener("scroll", measureScrollEdge, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(rail);
    observer.observe(row);
    return () => {
      rail.removeEventListener("scroll", measureScrollEdge);
      observer.disconnect();
    };
  }, [items, value]);

  const { open, show, hide } = sheet;
  useLayoutEffect(() => {
    if (hasItems) return;
    pendingSelection.current = null;
    if (open) hide();
  }, [hasItems, open, hide]);

  if (!hasItems) return null;
  return (
    <div
      ref={barRef}
      className="sticky top-0 z-20 -mx-4 bg-(--menu-category-surface) px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 [--menu-category-surface:color-mix(in_oklch,var(--background)_65%,var(--accent))] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-linear-to-b after:from-(--menu-category-surface) after:to-transparent"
    >
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => (nextOpen ? show() : hide())}
        onOpenChangeComplete={(nextOpen) => {
          if (nextOpen || pendingSelection.current === null) return;
          // Let the portal release focus and the history step restore scroll first.
          requestAnimationFrame(() => {
            const id = pendingSelection.current;
            pendingSelection.current = null;
            if (id !== null) select(id, true);
          });
        }}
      >
        <div ref={toolbar} className="flex min-w-0 items-center gap-2">
          <FilterChips
            label={m.menu}
            items={items}
            value={value}
            onChange={select}
            className={
              canScrollRight
                ? "mask-[linear-gradient(to_right,black_calc(100%-12px),transparent)] has-focus-visible:mask-none"
                : undefined
            }
            singleRow
            viewportRef={viewport}
            contentRef={content}
          />
          {(overflows || open) && (
            <SheetTrigger
              aria-label={m.categories}
              render={<Button variant="outline" size="icon" />}
            >
              <List aria-hidden="true" className="size-5" />
            </SheetTrigger>
          )}
        </div>
        <SheetContent
          side="bottom"
          lang={language}
          closeLabel={orderMessages[language].close}
          finalFocus={() => {
            if (pendingSelection.current !== null) return false;
            return overflows ? true : (selectedChip(viewport.current) ?? true);
          }}
          className="pb-safe mx-auto max-h-[80dvh] max-w-lg gap-0 rounded-t-3xl motion-reduce:transition-none"
        >
          <SheetHeader className="shrink-0 pr-16">
            <SheetTitle>{m.categories}</SheetTitle>
          </SheetHeader>
          <ul className="min-h-0 space-y-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-2">
            {items.map((item) => {
              const selected = item.value === value;
              return (
                <li key={item.value}>
                  <Button
                    variant={selected ? "default" : "ghost"}
                    aria-pressed={selected}
                    lang={item.lang}
                    className="w-full justify-between text-left"
                    onClick={() => {
                      if (pendingSelection.current !== null) return;
                      pendingSelection.current = item.value;
                      hide();
                    }}
                  >
                    <span className="min-w-0 wrap-break-word">{item.label}</span>
                    {selected && <Check aria-hidden="true" />}
                  </Button>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
