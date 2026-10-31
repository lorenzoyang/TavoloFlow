import {
  ChevronUp,
  Plus,
  RefreshCw,
  ShoppingBag,
  TriangleAlert,
  UtensilsCrossed,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FilterChips } from "@/components/filter-chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMoney } from "@/lib/format";
import { displayName, isLanguage, LANGUAGES, type Language } from "@/lib/language";
import { cn } from "@/lib/utils";
import type { Category, MenuItem } from "@/features/menu/api";
import { DishPhoto } from "@/features/menu/ItemImage";
import { usePhoto } from "@/features/menu/usePhoto";
import { orderMessages } from "@/features/orders/messages";
import { totalCents, type CartLine } from "@/features/orders/state";
import { allergenNames, languageLabels, messages } from "./messages";

// What the menu views need from a cart; the QR table page and the online pickup page each bring their own.
// Adding dishes is allowed only while editing: never while busy, confirming or waiting on a pending result.
export type MenuCart = {
  lines: CartLine[];
  stage: "editing" | "busy" | "confirming" | "pending";
  add: (item: MenuItem) => void;
};
type MenuData = { categories: Category[]; items: MenuItem[] };

const shortLabels: Record<Language, string> = { zh: "中文", it: "IT", en: "EN" };

export function LanguageToggle({
  language,
  select,
}: {
  language: Language;
  select: (value: Language) => void;
}) {
  return (
    <ToggleGroup
      aria-label={messages[language].languages}
      variant="outline"
      spacing={0}
      value={[language]}
      // Pressing the current language again would empty the group; keep the selection instead.
      onValueChange={(values) => {
        if (isLanguage(values[0])) select(values[0]);
      }}
    >
      {LANGUAGES.map((value) => (
        <ToggleGroupItem
          key={value}
          value={value}
          lang={value}
          aria-label={languageLabels[value]}
          className="bg-card px-2.5 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          {shortLabels[value]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function MenuHeader({
  restaurantName,
  subtitle,
  language,
  selectLanguage,
  refreshing,
  refresh,
}: {
  restaurantName: string;
  subtitle: string;
  language: Language;
  selectLanguage: (value: Language) => void;
  refreshing: boolean;
  refresh: () => void;
}) {
  const m = messages[language];
  return (
    <header className="border-b bg-card pt-safe">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-3 px-4 py-4">
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="font-display text-2xl leading-tight font-semibold wrap-break-word">
            {restaurantName}
          </h1>
          <p className="mt-1 font-medium text-muted-foreground wrap-break-word">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle language={language} select={selectLanguage} />
          <Button
            variant="outline"
            size="icon"
            aria-label={m.retry}
            disabled={refreshing}
            onClick={refresh}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>
    </header>
  );
}

function Allergens({ item, language }: { item: MenuItem; language: Language }) {
  const m = messages[language];
  if (!item.allergenReviewed)
    return <p className="text-xs text-muted-foreground">{m.unreviewed}</p>;
  if (item.allergenCodes.length === 0)
    return <p className="text-xs text-muted-foreground">{m.reviewedEmpty}</p>;
  return (
    <p className="flex items-start gap-1.5 text-xs leading-5">
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0 text-warning-foreground"
      />
      <span>
        <span className="font-medium">{m.allergens}: </span>
        {item.allergenCodes
          .map((code) => allergenNames[language][code] ?? m.unreviewed)
          .join(" · ")}
      </span>
    </p>
  );
}

function DishRow({
  item,
  language,
  defaultLanguage,
  count,
  add,
  disabled,
}: {
  item: MenuItem;
  language: Language;
  defaultLanguage: Language;
  count: number;
  add: () => void;
  disabled: boolean;
}) {
  const m = messages[language];
  const name = displayName(item, defaultLanguage, language);
  const description = { zh: item.descriptionZh, it: item.descriptionIt, en: item.descriptionEn }[
    name.language
  ];
  const photo = usePhoto(item.imageId);
  const addButton = (
    <Button
      size="icon-lg"
      className={cn(
        "relative rounded-full",
        photo.shown && "absolute -right-2 -bottom-2 border-2 border-card shadow-sm",
      )}
      disabled={disabled || !item.isAvailable || !item.allergenReviewed}
      aria-label={`${orderMessages[language].add}: ${name.text}`}
      onClick={add}
    >
      <Plus />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex min-w-6 items-center justify-center rounded-full border-2 border-card bg-foreground px-1 text-xs font-semibold text-background tabular-nums">
          {count}
        </span>
      )}
    </Button>
  );
  return (
    <li className="flex gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="min-w-0 flex-1 space-y-1.5">
        {item.itemCode && (
          <p className="text-xs text-muted-foreground wrap-break-word">{item.itemCode}</p>
        )}
        <h3 lang={name.language} className="text-base leading-snug font-semibold wrap-break-word">
          {name.text}
        </h3>
        {!item.isAvailable && <Badge variant="secondary">{m.soldOut}</Badge>}
        {description && (
          <p
            lang={name.language}
            className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground wrap-break-word"
          >
            {description}
          </p>
        )}
        <Allergens item={item} language={language} />
      </div>
      {/* The text column never moves; a photo only fills the price column, with the add button
          on its corner so that button stays at the card's bottom right either way. */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-3">
        <p className="font-semibold tabular-nums">{formatMoney(item.priceCents, language)}</p>
        {photo.shown ? (
          <div className="relative mr-2 mb-2">
            <DishPhoto
              imageId={photo.shown}
              onError={photo.fail}
              className={cn("size-24 sm:size-28", !item.isAvailable && "opacity-60 grayscale")}
            />
            {addButton}
          </div>
        ) : (
          addButton
        )}
      </div>
    </li>
  );
}

// Categories filter the list; the chip bar stays reachable while scrolling a long menu.
export function MenuList({
  menu,
  defaultLanguage,
  language,
  cart,
  categoryId,
  selectCategory,
}: {
  menu: MenuData;
  defaultLanguage: Language;
  language: Language;
  cart: MenuCart;
  categoryId: string;
  selectCategory: (id: string) => void;
}) {
  const m = messages[language];
  // A removed category falls back to the full menu.
  const selected = menu.categories.find((category) => category.id === categoryId);
  const categories = selected ? [selected] : menu.categories;
  const counts = new Map<string, number>();
  for (const line of cart.lines)
    counts.set(line.item.id, (counts.get(line.item.id) ?? 0) + line.quantity);
  const disabled = cart.stage !== "editing";
  if (menu.items.length === 0) return <EmptyState icon={UtensilsCrossed} title={m.empty} />;
  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 -mx-4 bg-background/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <FilterChips
          label={m.menu}
          value={selected?.id ?? ""}
          onChange={selectCategory}
          items={[
            { value: "", label: m.all },
            ...menu.categories.map((category) => {
              const name = displayName(category, defaultLanguage, language);
              return { value: category.id, label: name.text, lang: name.language };
            }),
          ]}
        />
      </div>
      {categories.map((category) => {
        const name = displayName(category, defaultLanguage, language);
        const items = menu.items.filter((item) => item.categoryId === category.id);
        return (
          <section
            key={category.id}
            className="space-y-3"
            aria-labelledby={`category-${category.id}`}
          >
            <h2
              id={`category-${category.id}`}
              lang={name.language}
              className="font-display text-xl font-semibold wrap-break-word"
            >
              {name.text}
            </h2>
            {items.length ? (
              <ul className="grid gap-3">
                {items.map((item) => (
                  <DishRow
                    key={item.id}
                    item={item}
                    language={language}
                    defaultLanguage={defaultLanguage}
                    count={counts.get(item.id) ?? 0}
                    add={() => cart.add(item)}
                    disabled={disabled}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{m.emptyCategory}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

// Phones only: the cart lives in a bottom sheet this bar opens.
export function CartBar({
  cart,
  language,
  open,
}: {
  cart: MenuCart;
  language: Language;
  open: () => void;
}) {
  const m = orderMessages[language];
  const portions = cart.lines.reduce((n, line) => n + line.quantity, 0);
  const pending = cart.stage === "pending";
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-linear-to-t from-background via-background/95 to-transparent px-4 pt-6">
      <button
        type="button"
        onClick={open}
        className={cn(
          "mx-auto flex min-h-14 w-full max-w-lg items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          pending ? "bg-warning text-warning-foreground" : "bg-primary text-primary-foreground",
        )}
      >
        <ShoppingBag aria-hidden="true" className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 font-medium">
          {pending ? m.lookup : cart.stage === "confirming" ? m.confirming : m.viewCart}
          <span className="block text-sm opacity-85">
            {portions} {m.portions}
          </span>
        </span>
        <span className="text-lg font-semibold tabular-nums">
          {formatMoney(totalCents(cart.lines), language)}
        </span>
        <ChevronUp aria-hidden="true" className="size-5 shrink-0" />
      </button>
    </div>
  );
}
