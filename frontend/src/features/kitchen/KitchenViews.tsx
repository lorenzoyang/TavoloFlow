import { Check, MoreHorizontal, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrderLine } from "@/features/orders/api";
import { formatDateTime, formatMoney, formatTime, shortId } from "@/lib/format";
import { displayName } from "@/lib/language";
import { optionSummary } from "@/lib/options";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import type { KitchenOrder } from "./api";
import { kitchenMessages } from "./messages";
import { waitLevel, type DishGroup } from "./state";

// What a card needs from the page to act on one of its lines.
export type LineControls = {
  now: number;
  // One operation at a time per order, and none on a view that is not known to be current.
  isLocked: (order: KitchenOrder) => boolean;
  ready: (order: KitchenOrder, line: OrderLine) => void;
  // Opens the confirmation; nothing is cancelled without it.
  cancel: (order: KitchenOrder, line: OrderLine) => void;
};

const waitStyles = {
  normal: "bg-secondary text-secondary-foreground",
  late: "bg-warning text-warning-foreground",
  overdue: "bg-destructive text-white",
};

const waitedMinutes = (now: number, order: KitchenOrder) =>
  Math.max(0, Math.floor((now - Date.parse(order.createdAt)) / 60_000));

function WaitBadge({ minutes }: { minutes: number }) {
  const m = kitchenMessages[useStaffLanguage()];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
        waitStyles[waitLevel(minutes)],
      )}
    >
      <Timer aria-hidden="true" className="size-4" />
      {m.waited(minutes)}
    </span>
  );
}

function LineActions({
  order,
  line,
  label,
  controls,
}: {
  order: KitchenOrder;
  line: OrderLine;
  label: string;
  controls: LineControls;
}) {
  const m = kitchenMessages[useStaffLanguage()];
  const locked = controls.isLocked(order);
  return (
    <>
      <Button className="flex-1" disabled={locked} onClick={() => controls.ready(order, line)}>
        <Check />
        {m.ready}
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              disabled={locked}
              aria-label={m.moreActions(label)}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            disabled={locked}
            onClick={() => controls.cancel(order, line)}
          >
            {m.cancelItem}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

// Every NEW line of one dish across the loaded orders, the longest wait first. Each line is still
// written on its own, so recovery and locking stay per order exactly as on the tickets.
export function DishCard({ group, controls }: { group: DishGroup; controls: LineControls }) {
  const language = useStaffLanguage();
  const m = kitchenMessages[language];
  const c = staffMessages[language];
  const first = group.lines[0];
  const name = displayName(first.line, first.order.defaultLanguage, language);
  return (
    <article className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      {/* The total keeps its own column, so a long name never pushes it onto a line of its own. */}
      <header className="space-y-2">
        <h2 className="flex items-start justify-between gap-3 text-2xl font-bold">
          <span lang={name.language} className="min-w-0 wrap-break-word">
            {first.line.itemCode && (
              <span className="mr-2 text-base font-medium text-muted-foreground">
                {first.line.itemCode}
              </span>
            )}
            {name.text}
          </span>
          <span className="shrink-0 tabular-nums">×{group.quantity}</span>
        </h2>
        <div className="flex">
          <WaitBadge minutes={waitedMinutes(controls.now, first.order)} />
        </div>
      </header>
      <ul className="divide-y border-t">
        {group.lines.map(({ order, line }) => (
          <li key={line.id} className="space-y-2 py-2.5">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-lg leading-7 font-semibold wrap-break-word">
                  {c.table(order.tableLabel)} ×{line.quantity}
                </p>
                <p className="text-sm text-muted-foreground">
                  {m.waited(waitedMinutes(controls.now, order))}
                </p>
                {line.options.length > 0 && (
                  <p className="font-medium wrap-break-word">
                    {optionSummary(line.options, order.defaultLanguage, language)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <LineActions
                  order={order}
                  line={line}
                  label={`${c.table(order.tableLabel)} · ${name.text}`}
                  controls={controls}
                />
              </div>
            </div>
            {line.remark && (
              <p className="rounded-lg bg-warning/20 px-2.5 py-1.5 font-medium whitespace-pre-wrap wrap-break-word">
                {c.remark(line.remark)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

// Keep every line in its original position until the whole ticket is processed.
export function OrderTicket({ order, controls }: { order: KitchenOrder; controls: LineControls }) {
  const language = useStaffLanguage();
  const m = kitchenMessages[language];
  const c = staffMessages[language];
  const cancelled = order.items.every((i) => i.status === "CANCELLED");
  const waiting = order.items.filter((i) => i.status === "NEW").length;
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs",
        cancelled && "bg-muted/60",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold wrap-break-word">{c.table(order.tableLabel)}</h2>
          <p className="text-sm text-muted-foreground">
            {m.orderedAt(formatTime(order.createdAt, language))} · #{shortId(order.id)}
          </p>
          <p className="mt-1 text-sm font-medium">{m.itemsWaiting(waiting, order.items.length)}</p>
        </div>
        {order.status === "NEW" ? (
          <WaitBadge minutes={waitedMinutes(controls.now, order)} />
        ) : (
          <Badge variant={cancelled ? "outline" : "success"}>
            {cancelled ? m.allCancelled : m.processed}
          </Badge>
        )}
      </header>
      <ul className="divide-y border-y">
        {order.items.map((line) => {
          const name = displayName(line, order.defaultLanguage, language);
          const compact = order.status === "NEW" && line.status !== "NEW";
          return (
            <li
              key={line.id}
              className={cn("space-y-2 py-2.5", compact && "py-1.5 text-sm text-muted-foreground")}
            >
              <div className="flex items-start gap-2">
                {line.status === "READY" && (
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                )}
                <p
                  lang={name.language}
                  className={cn(
                    "min-w-0 flex-1 font-medium wrap-break-word",
                    !compact && "text-lg leading-7",
                    line.status === "CANCELLED" && "text-muted-foreground line-through",
                  )}
                >
                  {line.itemCode && (
                    <span className="mr-2 text-sm text-muted-foreground">{line.itemCode}</span>
                  )}
                  {name.text} ×{line.quantity}
                </p>
                {line.status !== "NEW" && (
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {m.item[line.status]}
                  </span>
                )}
              </div>
              {line.options.length > 0 && (
                <p
                  className={cn(
                    "wrap-break-word",
                    !compact && "font-medium",
                    line.status === "CANCELLED" && "text-muted-foreground line-through",
                  )}
                >
                  {optionSummary(line.options, order.defaultLanguage, language)}
                </p>
              )}
              {!compact && (
                <>
                  {line.remark && (
                    <p
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 font-medium whitespace-pre-wrap wrap-break-word",
                        line.status === "NEW" ? "bg-warning/20" : "bg-secondary",
                      )}
                    >
                      {c.remark(line.remark)}
                    </p>
                  )}
                  {line.readyAt && (
                    <p className="text-xs text-muted-foreground">
                      {m.readyAt(formatDateTime(line.readyAt, language))}
                    </p>
                  )}
                  {line.cancelledAt && (
                    <p className="text-xs text-muted-foreground">
                      {m.cancelledAt(formatDateTime(line.cancelledAt, language))}
                    </p>
                  )}
                </>
              )}
              {line.status === "NEW" && (
                <div className="flex gap-2">
                  <LineActions order={order} line={line} label={name.text} controls={controls} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {order.status === "PROCESSED" && (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {m.amounts(
              formatMoney(order.totalAmountCents, language),
              formatMoney(order.payableAmountCents, language),
            )}
          </p>
          {order.processedAt && <p>{m.processedAt(formatDateTime(order.processedAt, language))}</p>}
        </div>
      )}
    </article>
  );
}
