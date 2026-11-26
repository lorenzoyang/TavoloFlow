import { Pencil, Trash2 } from "lucide-react";
import { DishPrice } from "@/components/dish-price";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/format";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { type Menu, type MenuItem } from "./api";
import { displayName } from "@/lib/language";
import { ItemThumbnail } from "./ItemImage";
import { allergenLabel, menuMessages } from "./messages";
import { dishPriceCents } from "@/features/orders/options";
import type { ReactNode } from "react";
import type { MenuEditor } from "./MenuEditorSheet";

export function MenuDishList({
  menu,
  items,
  owner,
  disabled,
  open,
  toggleAvailability,
  inlineResult,
}: {
  menu: Menu;
  items: MenuItem[];
  owner: boolean;
  disabled: boolean;
  open: (editor: MenuEditor) => void;
  toggleAvailability: (item: MenuItem) => void;
  inlineResult: (id: string) => ReactNode;
}) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  const categoryName = (id: string) =>
    displayName(
      menu.categories.find((category) => category.id === id)!,
      menu.defaultLanguage,
      language,
    ).text;
  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((item) => {
        const name = displayName(item, menu.defaultLanguage, language);
        const description = {
          zh: item.descriptionZh,
          it: item.descriptionIt,
          en: item.descriptionEn,
        }[name.language];
        return (
          <li
            key={item.id}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-muted-foreground wrap-break-word">
                  {categoryName(item.categoryId)}
                  {item.itemCode ? ` · ${item.itemCode}` : ""}
                </p>
                <h3
                  className={cn(
                    "font-semibold wrap-break-word",
                    !item.isAvailable && "text-muted-foreground",
                  )}
                >
                  {name.text}
                </h3>
                {description && (
                  <p className="line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground wrap-break-word">
                    {description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <DishPrice
                  stacked
                  className="font-semibold"
                  regular={
                    item.salePriceCents === null ? null : formatMoney(item.priceCents, language)
                  }
                  regularLabel={m.regularPrice}
                >
                  {formatMoney(dishPriceCents(item), language)}
                </DishPrice>
                {item.imageId && <ItemThumbnail imageId={item.imageId} className="size-16" />}
              </div>
            </div>
            {!item.allergenReviewed ? (
              <p className="text-sm text-destructive">{m.unreviewed}</p>
            ) : item.allergenCodes.length === 0 ? (
              <p className="text-xs text-muted-foreground">{m.reviewedEmpty}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {item.allergenCodes.map((code) => (
                  <Badge variant="outline" key={code}>
                    {allergenLabel(
                      menu.allergens.find((option) => option.code === code) ?? {
                        code,
                        label: code,
                      },
                      language,
                    )}
                  </Badge>
                ))}
              </div>
            )}
            {/* Wraps the owner's buttons under the switch when the labels are longer (Italian). */}
            <div className="mt-auto flex flex-wrap items-center gap-3 border-t pt-3">
              <Switch
                aria-label={m.availability(name.text)}
                checked={item.isAvailable}
                disabled={disabled || (!item.isAvailable && !item.allergenReviewed)}
                onCheckedChange={() => toggleAvailability(item)}
              />
              <span
                className={cn(
                  "text-sm font-medium",
                  item.isAvailable ? "text-success" : "text-muted-foreground",
                )}
              >
                {item.isAvailable ? m.available : m.soldOut}
              </span>
              {owner && (
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    aria-label={m.editOf(name.text)}
                    onClick={() =>
                      open({
                        kind: "item",
                        value: item,
                        categoryId: item.categoryId,
                      })
                    }
                  >
                    <Pencil />
                    {m.edit}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    aria-label={m.removeOf(name.text)}
                    onClick={() =>
                      open({
                        kind: "delete",
                        resource: "items",
                        id: item.id,
                        name: name.text,
                      })
                    }
                  >
                    <Trash2 />
                    {m.remove}
                  </Button>
                </div>
              )}
            </div>
            {inlineResult(item.id)}
          </li>
        );
      })}
    </ul>
  );
}
