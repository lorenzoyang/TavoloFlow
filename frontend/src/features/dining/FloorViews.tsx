import { KeyRound, Plus } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BillSummary } from "@/features/billing/state";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CodeResult, FloorTable } from "./api";

// Empty tables open on tap; dining tables show their opening time, unsent kitchen work and amount.
export function TableTile({
  table,
  selected,
  disabled,
  onSelect,
}: {
  table: FloorTable;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const session = table.session;
  const status = session
    ? `用餐中，${session.newOrderCount ? `待出餐 ${session.newOrderCount} 笔，` : ""}${formatMoney(session.totalAmountCents)}`
    : table.isEnabled
      ? "空桌，点按开桌"
      : "已停用";
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={session ? selected : undefined}
      aria-label={`${table.tableLabel}：${status}`}
      onClick={onSelect}
      className={cn(
        "relative flex min-h-28 flex-col justify-between gap-2 rounded-2xl border p-3 text-left shadow-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        session
          ? "border-primary/25 bg-accent hover:border-primary/60"
          : table.isEnabled
            ? "bg-card hover:border-primary/40"
            : "border-dashed bg-muted/70 shadow-none",
        selected && "ring-2 ring-primary",
      )}
    >
      <span className="pr-8 text-2xl leading-tight font-semibold wrap-break-word">
        {table.tableLabel}
      </span>
      {session && session.newOrderCount > 0 && (
        <Badge variant="warning" className="absolute top-2.5 right-2.5">
          {session.newOrderCount}
        </Badge>
      )}
      {!session && table.isEnabled && (
        <Plus aria-hidden="true" className="absolute top-3 right-3 size-4 text-muted-foreground" />
      )}
      {session ? (
        <span className="space-y-0.5">
          <span className="block text-xs text-muted-foreground">
            {formatTime(session.openedAt)} 开桌
          </span>
          <span className="block font-semibold tabular-nums">
            {formatMoney(session.totalAmountCents)}
          </span>
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">{table.isEnabled ? "空桌" : "已停用"}</span>
      )}
    </button>
  );
}

// The selected visit: status, the join code on request (only where the restaurant requires one),
// then its bill (rendered by the caller).
export function SessionSummary({
  session,
  codeRequired,
  code,
  disabled,
  viewCode,
}: {
  session: BillSummary | undefined;
  codeRequired: boolean;
  code: CodeResult | null;
  disabled: boolean;
  viewCode: () => void;
}) {
  if (!session) return <LoadingState label="正在读取本轮用餐…" />;
  const active = session.status === "ACTIVE";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant={active ? "default" : "secondary"}>{active ? "用餐中" : "本轮已结束"}</Badge>
        <span>开桌：{formatDateTime(session.openedAt)}</span>
        {active && <span>已提交订单 {session.orderCount} 笔</span>}
      </div>
      {active &&
        codeRequired &&
        (code?.sessionId === session.sessionId ? (
          <div className="space-y-2 rounded-2xl border border-primary/25 bg-accent p-4">
            <label htmlFor="staff-join-code" className="text-sm font-medium">
              本轮入桌码 · 仅告知本桌顾客
            </label>
            <Input
              id="staff-join-code"
              readOnly
              value={code.joinCode}
              className="h-16 bg-card pl-[0.5em] text-center font-mono text-4xl font-semibold tracking-[0.5em]"
              onFocus={(e) => e.target.select()}
            />
          </div>
        ) : (
          <Button variant="outline" className="w-full" disabled={disabled} onClick={viewCode}>
            <KeyRound />
            查看入桌码
          </Button>
        ))}
    </div>
  );
}
