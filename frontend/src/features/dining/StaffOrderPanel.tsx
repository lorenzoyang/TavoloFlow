import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DishPrice } from "@/components/dish-price";
import { FilterChips } from "@/components/filter-chips";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import type { CurrentAccount } from "@/features/accounts/api";
import { menuQuery } from "@/features/menu/api";
import { OptionPicker } from "@/features/orders/OptionPicker";
import { CartLines } from "@/features/orders/OrderViews";
import { dishPriceCents, itemGroups } from "@/features/orders/options";
import { totalCents } from "@/features/orders/state";
import { formatMoney } from "@/lib/format";
import { displayName } from "@/lib/language";
import { useHistorySheet } from "@/lib/useHistorySheet";
import { useLiveActive } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { staffOrderMessages } from "./staff-order-messages";
import { useStaffOrder } from "./useStaffOrder";

export function StaffOrderPanel({
  account,
  tableId,
  tableTitle,
  sessionId,
  canSubmit,
  closed,
  onBack,
  onDone,
}: {
  account: CurrentAccount;
  tableId: string;
  tableTitle: string;
  sessionId: string;
  canSubmit: boolean;
  closed: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const language = useStaffLanguage();
  const m = staffOrderMessages[language];
  const active = useLiveActive();
  const query = useQuery(menuQuery(account));
  const menu = query.data;
  const [category, setCategory] = useState("");
  const [optionItemId, setOptionItemId] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const options = useHistorySheet(
    "staff-order-options",
    false,
    () => panel.current?.closest<HTMLElement>('[data-slot="detail-scroll"]') ?? null,
  );
  const cartHeading = useRef<HTMLHeadingElement>(null);
  const model = useStaffOrder({ account, tableId, sessionId, canSubmit, onDone });
  const { cart, review, busy, ended } = model;
  const locked = !canSubmit || !active || ended;
  const frozen = locked || busy || !!cart.pending || !!review;
  const optionItem = options.open
    ? (menu?.items.find((item) => item.id === optionItemId) ?? null)
    : null;
  useEffect(() => {
    if (options.open && (!optionItem || closed || ended || cart.pending)) options.hide();
  });
  const defaultLanguage = menu?.defaultLanguage ?? language;
  const currentCategory = menu?.categories.some((entry) => entry.id === category) ? category : "";
  const dishes = menu?.items.filter(
    (item) => !currentCategory || item.categoryId === currentCategory,
  );
  const subtotal = (lines: typeof cart.lines) => formatMoney(totalCents(lines), language);

  return (
    <section ref={panel} aria-label={m.place} className="min-w-0 space-y-4">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> {m.back}
      </Button>
      {menu && cart.lines.length > 0 && !cart.pending && !closed && !ended && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-2 border-y bg-card py-2">
          <Button
            variant="ghost"
            onClick={() => {
              cartHeading.current?.focus({ preventScroll: true });
              cartHeading.current?.scrollIntoView({ block: "start" });
            }}
          >
            {m.cart} · {subtotal(cart.lines)}
          </Button>
          <Button disabled={frozen || query.isError} onClick={() => void model.prepare()}>
            {m.review}
          </Button>
          {model.feedback && (
            <div className="mt-2 w-full">
              <Notice tone="error">{model.feedback}</Notice>
            </div>
          )}
        </div>
      )}
      {query.isPending && active && !closed && <LoadingState label={m.loading} />}
      {(query.isError || query.fetchStatus === "paused") && active && !closed && (
        <Notice
          tone="error"
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              {m.refresh}
            </Button>
          }
        >
          {m.menuError}
        </Notice>
      )}
      {menu && !closed && !ended && !cart.pending && (
        <>
          <FilterChips
            label={m.category}
            items={[
              { value: "", label: m.all },
              ...menu.categories.map((entry) => {
                const name = displayName(entry, defaultLanguage, language);
                return { value: entry.id, label: name.text, lang: name.language };
              }),
            ]}
            value={currentCategory}
            onChange={setCategory}
          />
          <ul className="divide-y rounded-xl border px-3">
            {dishes?.map((item) => {
              const name = displayName(item, defaultLanguage, language);
              const unavailable = !item.isAvailable || !item.allergenReviewed;
              return (
                <li key={item.id} className="flex min-w-0 items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p lang={name.language} className="font-medium wrap-break-word">
                      {item.itemCode && (
                        <span className="mr-2 text-muted-foreground">{item.itemCode}</span>
                      )}
                      {name.text}
                    </p>
                    <DishPrice
                      className="text-sm text-muted-foreground"
                      regular={
                        item.salePriceCents === null ? null : formatMoney(item.priceCents, language)
                      }
                      regularLabel={m.regularPrice}
                    >
                      {formatMoney(dishPriceCents(item), language)}
                    </DishPrice>
                    {unavailable && (
                      <p className="text-xs text-muted-foreground">
                        {item.isAvailable ? m.needsReview : m.soldOut}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={m.add(name.text)}
                    disabled={frozen || unavailable || query.isError}
                    onClick={() => {
                      if (itemGroups(item, menu.optionGroups).length) {
                        setOptionItemId(item.id);
                        options.show();
                      } else model.add(item, menu);
                    }}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
            {dishes?.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">{m.noDishes}</li>
            )}
          </ul>
          <OptionPicker
            item={optionItem}
            groups={menu.optionGroups}
            defaultLanguage={defaultLanguage}
            language={language}
            disabled={frozen}
            close={options.hide}
            add={(item, ids) => {
              model.add(item, menu, ids);
              options.hide();
            }}
          />
        </>
      )}
      {cart.lines.length > 0 && menu && (
        <div className="space-y-2">
          <h3 ref={cartHeading} tabIndex={-1} className="scroll-mt-24 font-semibold">
            {m.cart}
          </h3>
          <CartLines
            lines={cart.lines}
            editable={!cart.pending && !closed}
            frozen={frozen}
            menu={menu}
            defaultLanguage={defaultLanguage}
            language={language}
            change={model.line}
          />
        </div>
      )}
      {model.feedback && (!menu || !cart.lines.length || cart.pending || closed || ended) && (
        <Notice tone={ended ? "warning" : "error"}>{model.feedback}</Notice>
      )}
      {cart.pending && (
        <Notice
          tone="warning"
          action={
            <>
              <Button
                variant="outline"
                disabled={!active || busy}
                onClick={() => void model.recover()}
              >
                {m.lookup}
              </Button>
              {model.notFound && (
                <Button disabled={locked || busy} onClick={() => void model.retry()}>
                  {m.retry}
                </Button>
              )}
            </>
          }
        >
          {model.notFound ? m.notFound : m.pending}
        </Notice>
      )}
      {!ended && (closed || (!canSubmit && !cart.pending) || !active) && (
        <Notice tone="warning">{closed ? m.ended : !active ? m.offline : m.blocked}</Notice>
      )}
      <ConfirmDialog
        open={!!review && !!menu}
        title={
          <span className="block wrap-anywhere">
            {m.review} · {tableTitle}
          </span>
        }
        contentClassName="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]"
        confirmLabel={m.send}
        busy={busy}
        confirmDisabled={locked}
        onConfirm={() => void model.confirm()}
        onCancel={model.dismissReview}
      >
        {review && menu && (
          <div className="min-h-0 max-h-[45dvh] overflow-y-auto">
            <CartLines
              lines={review.lines}
              editable={false}
              frozen
              menu={menu}
              defaultLanguage={defaultLanguage}
              language={language}
              change={model.line}
            />
            <p className="flex justify-between gap-3 border-t pt-2 font-semibold">
              <span>{m.total}</span>
              <span>{subtotal(review.lines)}</span>
            </p>
          </div>
        )}
      </ConfirmDialog>
    </section>
  );
}
