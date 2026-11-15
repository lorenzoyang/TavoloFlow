import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import type { CurrentAccount } from "@/features/accounts/api";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { displayName, type Language } from "@/lib/language";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import type { Category, MenuItem } from "./api";
import { menuMessages } from "./messages";
import { useItemOrder } from "./useItemOrder";

export type ItemOrderSnapshot = {
  category: Category;
  defaultLanguage: Language;
  items: MenuItem[];
};

export function ItemOrderForm({
  initial,
  account,
  busy,
  setBusy,
  saved,
  cancel,
}: {
  initial: ItemOrderSnapshot;
  account: CurrentAccount;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  saved: (result: "refreshed" | "failed") => void;
  cancel: () => void;
}) {
  const language = useStaffLanguage();
  const m = menuMessages[language];
  const actions = useItemOrder(account, setBusy);
  const [draft, setDraft] = useState({ snapshot: initial, items: initial.items, exists: true });
  const changed = draft.items.some((item, index) => item.id !== draft.snapshot.items[index]?.id);
  const disabled = busy || actions.error !== null || !draft.exists;

  function move(index: number, by: number) {
    if (disabled || index + by < 0 || index + by >= draft.items.length) return;
    const items = [...draft.items];
    [items[index], items[index + by]] = [items[index + by], items[index]];
    setDraft({ ...draft, items });
  }

  async function reload() {
    const menu = await actions.reload();
    if (!menu) return;
    const category = menu.categories.find((value) => value.id === initial.category.id);
    const items = menu.items.filter((item) => item.categoryId === initial.category.id);
    setDraft({
      snapshot: {
        category: category ?? draft.snapshot.category,
        defaultLanguage: menu.defaultLanguage,
        items,
      },
      items,
      exists: !!category,
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || !changed) return;
        const result = await actions.save(
          initial.category.id,
          draft.items.map((item) => item.id),
        );
        if (result) saved(result);
      }}
    >
      <div>
        <h3 className="font-semibold wrap-break-word">
          {displayName(draft.snapshot.category, draft.snapshot.defaultLanguage, language).text}
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{m.itemOrderHint}</p>
      </div>
      {actions.error && (
        <Notice
          tone="error"
          action={
            <Button variant="outline" disabled={busy} onClick={() => void reload()}>
              {m.reloadItemOrder}
            </Button>
          }
        >
          {errorMessage(
            actions.error.value,
            actions.error.reading ? m.readError : m.unknown,
            language,
          )}
        </Notice>
      )}
      {!draft.exists && <Notice tone="error">{m.itemOrderCategoryMissing}</Notice>}
      <ol className="divide-y">
        {draft.items.map((item, index) => {
          const name = displayName(item, draft.snapshot.defaultLanguage, language).text;
          return (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium wrap-break-word">{name}</p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {formatMoney(item.priceCents, language)}
                </p>
              </div>
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
                  disabled={disabled || index === draft.items.length - 1}
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
        <Button type="submit" disabled={disabled || !changed}>
          {busy ? m.saving : m.save}
        </Button>
        <Button variant="outline" disabled={busy} onClick={cancel}>
          {m.cancel}
        </Button>
      </div>
    </form>
  );
}
