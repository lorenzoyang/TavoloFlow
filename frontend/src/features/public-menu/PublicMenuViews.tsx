import { useEffect, useState, type ReactNode } from "react";
import { ChevronUp, Plus, RefreshCw, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { DishPrice } from "@/components/dish-price";
import { EmptyState } from "@/components/empty-state";
import { FilterChips } from "@/components/filter-chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMoney } from "@/lib/format";
import { displayName, isLanguage, LANGUAGES, type Language } from "@/lib/language";
import { useHistorySheet } from "@/lib/useHistorySheet";
import { cn } from "@/lib/utils";
import type { MenuItem, OptionGroup } from "@/features/menu/api";
import { DishPhoto } from "@/features/menu/ItemImage";
import { usePhoto } from "@/features/menu/usePhoto";
import { orderMessages } from "@/features/orders/messages";
import { OptionPicker } from "@/features/orders/OptionPicker";
import {
  dishPriceCents,
  hasExtraCost,
  itemGroups,
  optionsInStock,
} from "@/features/orders/options";
import { totalCents, type CartLine } from "@/features/orders/state";
import type { PublicMenu } from "./api";
import { allergenNames, languageLabels, messages } from "./messages";

const shortLabels: Record<Language, string> = { zh: "中文", it: "IT", en: "EN" };

// What the menu reads from a cart; the QR cart (useCart) and the online cart (useOnlineCart) both have it.
export type MenuCart = {
  cart: { lines: CartLine[]; pending: unknown };
  busy: boolean;
  review: unknown;
  add: (item: MenuItem, optionIds?: string[]) => void;
};
// The menu and the language its names fall back to: the QR and online bootstraps both carry them.
type MenuData = { restaurant: { defaultLanguage: Language }; menu: PublicMenu["menu"] };

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
  data,
  language,
  selectLanguage,
  refreshing,
  refresh,
}: {
  data: PublicMenu;
  language: Language;
  selectLanguage: (value: Language) => void;
  refreshing: boolean;
  refresh: () => void;
}) {
  const m = messages[language];
  return (
    <RestaurantHeader
      name={data.restaurant.name}
      language={language}
      selectLanguage={selectLanguage}
      details={
        <p className="flex min-h-11 items-center font-medium text-muted-foreground wrap-break-word">
          {m.table} {data.table.tableLabel}
        </p>
      }
      refresh={
        <Button
          variant="outline"
          size="icon"
          aria-label={m.retry}
          disabled={refreshing}
          onClick={refresh}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
        </Button>
      }
    />
  );
}

// The restaurant's name on a band of its own accent colour, shared by the QR and online pages. The
// language switch keeps the name's row, so phones spend one row less on the header; details (the
// table, the services) and actions (the phone) sit below, with the refresh button at their right.
export function RestaurantHeader({
  name,
  language,
  selectLanguage,
  details,
  actions,
  refresh,
}: {
  name: string;
  language: Language;
  selectLanguage: (value: Language) => void;
  details?: ReactNode;
  actions?: ReactNode;
  refresh?: ReactNode;
}) {
  return (
    <header className="border-b border-border/70 bg-linear-to-b from-accent to-background pt-safe">
      <div className="mx-auto max-w-6xl space-y-3 px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 pt-1.5 font-display text-2xl leading-tight font-semibold wrap-break-word sm:pt-1 sm:text-3xl">
            {name}
          </h1>
          <LanguageToggle language={language} select={selectLanguage} />
        </div>
        {(details || actions || refresh) && (
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-3">
              {details}
              {actions}
            </div>
            {refresh}
          </div>
        )}
      </div>
    </header>
  );
}

// Shown while the first menu read is in flight. The restaurant, its colours and its language are not
// known yet, so it keeps the default palette and announces loading in the page's fallback language.
export function MenuSkeleton({ language }: { language: Language }) {
  const m = messages[language];
  const block = "animate-pulse rounded-lg bg-muted";
  return (
    <div lang={language} className="min-h-dvh">
      <p role="status" className="sr-only">
        {m.loading}
      </p>
      <div aria-hidden="true">
        <div className="border-b border-border/70 bg-linear-to-b from-accent to-background pt-safe">
          <div className="mx-auto max-w-6xl space-y-3 px-4 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className={cn(block, "mt-1 h-8 w-48 min-w-0")} />
              <div className={cn(block, "h-11 w-34 shrink-0")} />
            </div>
            <div className={cn(block, "h-6 w-36")} />
          </div>
        </div>
        {/* From lg the right padding leaves the cart column's width (24rem plus its gap) empty. */}
        <div className="mx-auto max-w-6xl space-y-3 px-4 pt-5 lg:pr-108">
          <div className="flex gap-2 overflow-hidden py-1">
            {["w-20", "w-28", "w-24", "w-28"].map((width, index) => (
              <div key={index} className={cn(block, "h-11 shrink-0 rounded-full", width)} />
            ))}
          </div>
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-3 rounded-2xl border bg-card p-4">
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className={cn(block, "h-5 w-2/3")} />
                <div className={cn(block, "h-4 w-full")} />
                <div className={cn(block, "h-4 w-1/2")} />
              </div>
              <div className={cn(block, "size-24 shrink-0 rounded-xl")} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Allergens are information every dish carries, not a warning: plain text keeps the warning colour
// for what it means everywhere else (waiting, new, due soon).
function Allergens({ item, language }: { item: MenuItem; language: Language }) {
  const m = messages[language];
  if (!item.allergenReviewed)
    return <p className="text-xs text-muted-foreground">{m.unreviewed}</p>;
  if (item.allergenCodes.length === 0)
    return <p className="text-xs text-muted-foreground">{m.reviewedEmpty}</p>;
  return (
    <p className="text-xs leading-5 text-muted-foreground">
      <span className="font-medium text-foreground">{m.allergens}: </span>
      {item.allergenCodes.map((code) => allergenNames[language][code] ?? m.unreviewed).join(" · ")}
    </p>
  );
}

function DishRow({
  item,
  groups,
  language,
  defaultLanguage,
  count,
  add,
  disabled,
}: {
  item: MenuItem;
  groups: OptionGroup[];
  language: Language;
  defaultLanguage: Language;
  count: number;
  add: () => void;
  disabled: boolean;
}) {
  const m = messages[language];
  // A dish whose required choices have all sold out is sold out too.
  const soldOut = !item.isAvailable || !optionsInStock(item, groups);
  const price = formatMoney(dishPriceCents(item), language);
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
      disabled={disabled || soldOut || !item.allergenReviewed}
      aria-label={`${orderMessages[language].add}: ${name.text}`}
      onClick={add}
    >
      <Plus />
      {/* Inverted against the button, so it stands out in every theme (ink's primary is nearly the
          foreground colour); a new count remounts it to replay the pop. */}
      {count > 0 && (
        <span
          key={count}
          className="absolute -top-1.5 -right-1.5 flex min-w-6 animate-in items-center justify-center rounded-full border-2 border-primary bg-card px-1 text-xs font-semibold text-primary tabular-nums duration-200 zoom-in-50"
        >
          {count}
        </span>
      )}
    </Button>
  );
  return (
    <li className="flex min-w-0 gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="min-w-0 flex-1 space-y-1.5">
        {item.itemCode && (
          <p className="text-xs text-muted-foreground wrap-break-word">{item.itemCode}</p>
        )}
        <h3 lang={name.language} className="text-base leading-snug font-semibold wrap-break-word">
          {name.text}
        </h3>
        {soldOut && <Badge variant="secondary">{m.soldOut}</Badge>}
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
        <DishPrice
          stacked
          className="font-semibold text-primary"
          regular={item.salePriceCents === null ? null : formatMoney(item.priceCents, language)}
          regularLabel={orderMessages[language].regularPrice}
        >
          {hasExtraCost(item, groups) ? orderMessages[language].fromPrice(price) : price}
        </DishPrice>
        {photo.shown ? (
          <div className="relative mr-2 mb-2">
            <DishPhoto
              imageId={photo.shown}
              onError={photo.fail}
              // Two columns from xl make each card about a phone's width again.
              className={cn("size-24 sm:size-28 xl:size-24", soldOut && "opacity-60 grayscale")}
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
  data,
  language,
  cart,
  categoryId,
  selectCategory,
}: {
  data: MenuData;
  language: Language;
  cart: MenuCart;
  categoryId: string;
  selectCategory: (id: string) => void;
}) {
  const m = messages[language];
  const groups = data.menu.optionGroups;
  // The dish whose options are being chosen; its picker adds it to the cart. The picker is a history
  // step, so the back gesture closes it.
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const options = useHistorySheet("options");
  // Follows the refreshed menu: a dish that disappears closes the picker (as does a reload, which keeps
  // the history step but not the dish).
  const pickedItem = options.open
    ? (data.menu.items.find((item) => item.id === picking?.id) ?? null)
    : null;
  const lostPick = options.open && pickedItem === null;
  useEffect(() => {
    if (lostPick) options.hide();
  });
  // A removed category falls back to the full menu.
  const selected = data.menu.categories.find((category) => category.id === categoryId);
  const categories = selected ? [selected] : data.menu.categories;
  const counts = new Map<string, number>();
  for (const line of cart.cart.lines)
    counts.set(line.item.id, (counts.get(line.item.id) ?? 0) + line.quantity);
  const disabled = cart.busy || !!cart.cart.pending || !!cart.review;
  if (data.menu.items.length === 0) return <EmptyState icon={UtensilsCrossed} title={m.empty} />;
  return (
    <div className="space-y-6">
      {/* The fade below the bar lets cards slide under it instead of being cut off. */}
      <div className="sticky top-0 z-20 -mx-4 bg-background/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-linear-to-b after:from-background/95 after:to-transparent">
        <FilterChips
          label={m.menu}
          value={selected?.id ?? ""}
          onChange={selectCategory}
          items={[
            { value: "", label: m.all },
            ...data.menu.categories.map((category) => {
              const name = displayName(category, data.restaurant.defaultLanguage, language);
              return { value: category.id, label: name.text, lang: name.language };
            }),
          ]}
        />
      </div>
      {categories.map((category) => {
        const name = displayName(category, data.restaurant.defaultLanguage, language);
        const items = data.menu.items.filter((item) => item.categoryId === category.id);
        return (
          <section
            key={category.id}
            className="space-y-3"
            aria-labelledby={`category-${category.id}`}
          >
            <h2
              id={`category-${category.id}`}
              lang={name.language}
              className="flex items-start gap-2.5 font-display text-xl font-semibold"
            >
              <span aria-hidden="true" className="mt-1 h-5 w-1 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 wrap-break-word">{name.text}</span>
            </h2>
            {items.length ? (
              <ul className="grid gap-3 xl:grid-cols-2">
                {items.map((item) => (
                  <DishRow
                    key={item.id}
                    item={item}
                    groups={groups}
                    language={language}
                    defaultLanguage={data.restaurant.defaultLanguage}
                    count={counts.get(item.id) ?? 0}
                    add={() => {
                      if (!itemGroups(item, groups).length) return cart.add(item);
                      setPicking(item);
                      options.show();
                    }}
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
      <OptionPicker
        item={pickedItem}
        groups={groups}
        defaultLanguage={data.restaurant.defaultLanguage}
        language={language}
        disabled={disabled}
        close={options.hide}
        add={(item, optionIds) => {
          cart.add(item, optionIds);
          options.hide();
        }}
      />
    </div>
  );
}

// Phones only: the cart lives in a bottom sheet this bar opens.
export function CartBar({
  cart,
  amountCents,
  language,
  open,
  note,
}: {
  cart: Pick<MenuCart, "cart" | "review">;
  // Online checkout supplies its discounted total; QR carts use the sum of their lines.
  amountCents?: number;
  language: Language;
  open: () => void;
  // A short status after the count, such as the restaurant not taking orders right now.
  note?: string;
}) {
  const m = orderMessages[language];
  const portions = cart.cart.lines.reduce((n, line) => n + line.quantity, 0);
  const pending = !!cart.cart.pending;
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 animate-in bg-linear-to-t from-background via-background/95 to-transparent px-4 pt-6 duration-200 fade-in slide-in-from-bottom-4">
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
          {pending ? m.lookup : cart.review ? m.confirming : m.viewCart}
          <span className="block text-sm opacity-85">
            {m.portionCount(portions)}
            {note && ` · ${note}`}
          </span>
        </span>
        <span className="text-lg font-semibold tabular-nums">
          {formatMoney(amountCents ?? totalCents(cart.cart.lines), language)}
        </span>
        <ChevronUp aria-hidden="true" className="size-5 shrink-0" />
      </button>
    </div>
  );
}
