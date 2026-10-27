import { Check, HandPlatter, RefreshCw, Sun, Volume2, VolumeX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/language";
import { useWakeLock } from "@/lib/useWakeLock";
import { cn } from "@/lib/utils";
import { passWaitLevel, type PassTable } from "./state";
import { usePass } from "./usePass";

const toggleStyle =
  "aria-pressed:border-primary/40 aria-pressed:bg-accent aria-pressed:text-accent-foreground";
const waitStyles = {
  normal: "bg-secondary text-secondary-foreground",
  late: "bg-warning text-warning-foreground",
};

function TableCard({ table, model }: { table: PassTable; model: ReturnType<typeof usePass> }) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-xs">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 text-3xl font-bold wrap-break-word">{table.tableLabel} 桌</h2>
        <span className="shrink-0 text-sm text-muted-foreground">待送 {table.items.length} 道</span>
      </header>
      <ul className="divide-y border-t">
        {table.items.map((item) => {
          const name = displayName(item, item.defaultLanguage, "zh");
          const minutes = Math.max(
            0,
            Math.floor((model.view.now - Date.parse(item.readyAt)) / 60_000),
          );
          return (
            <li key={item.id} className="space-y-2 py-3">
              <div className="flex items-start gap-3">
                <p
                  lang={name.language}
                  className="min-w-0 flex-1 text-lg leading-7 font-medium wrap-break-word"
                >
                  {item.itemCode && (
                    <span className="mr-2 text-sm text-muted-foreground">{item.itemCode}</span>
                  )}
                  {name.text} ×{item.quantity}
                </p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium tabular-nums",
                    waitStyles[passWaitLevel(minutes)],
                  )}
                >
                  {minutes === 0 ? "刚出餐" : `已等 ${minutes} 分钟`}
                </span>
              </div>
              {item.remark && (
                <p className="rounded-lg bg-secondary px-2.5 py-1.5 text-sm whitespace-pre-wrap wrap-break-word">
                  备注：{item.remark}
                </p>
              )}
              <Button
                className="w-full"
                disabled={!model.fresh || model.busy.includes(item.id)}
                aria-label={`${table.tableLabel} 桌 ${name.text} 已送达`}
                onClick={() => void model.serve(item)}
              >
                <Check />
                已送达
              </Button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function PassContent({ account }: { account: CurrentAccount }) {
  const model = usePass(account);
  const wakeLock = useWakeLock();
  return (
    <div>
      <PageHeader
        title="传菜"
        description="厨房出餐后菜品出现在这里，最早出餐的桌在前。取走菜品时点「已送达」。"
        back={{ to: "/staff", label: "首页" }}
        actions={
          <>
            <Button
              variant="outline"
              className={toggleStyle}
              aria-pressed={model.sound}
              aria-label="声音提醒"
              onClick={model.toggleSound}
            >
              {model.sound ? <Volume2 /> : <VolumeX />}
              <span className="hidden sm:inline">声音提醒</span>
            </Button>
            {wakeLock.supported && (
              <Button
                variant="outline"
                className={toggleStyle}
                aria-pressed={wakeLock.enabled}
                aria-label="屏幕常亮"
                onClick={wakeLock.toggle}
              >
                <Sun />
                <span className="hidden sm:inline">屏幕常亮</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label="刷新菜品"
              disabled={!model.view.active || model.query.isFetching}
              onClick={() => void model.refresh()}
            >
              <RefreshCw className={cn(model.query.isFetching && "animate-spin")} />
            </Button>
          </>
        }
      />
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border bg-card px-4 py-3 shadow-xs">
          <p className="font-semibold">全店待送 {model.head?.totalCount ?? "—"} 道</p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "size-2.5 rounded-full",
                model.stalled
                  ? "bg-destructive"
                  : model.head
                    ? "bg-success"
                    : "bg-muted-foreground/40",
              )}
            />
            {model.head ? `最后成功同步：${formatDateTime(model.head.receivedAt)}` : "尚未同步"}
          </p>
        </div>
        {model.stalled && (
          <Notice tone="error">
            {!model.view.active
              ? "连接已断开或页面暂停。"
              : model.query.isPending
                ? "正在同步菜品。"
                : "菜品可能尚未更新。"}{" "}
            暂停标记送达，成功同步后即可继续。
          </Notice>
        )}
        {model.notice && <Notice>{model.notice}</Notice>}
        {(model.error || model.query.isError) && (
          <Notice tone="error">{model.error || "无法更新菜品，请检查连接后刷新。"}</Notice>
        )}
        {model.soundBlocked && (
          <Notice
            tone="warning"
            action={
              <Button variant="outline" onClick={model.unlockSound}>
                <Volume2 />
                开启声音
              </Button>
            }
          >
            浏览器要求先点按一次页面才能播放提醒声。点按页面任意位置即可开启。
          </Notice>
        )}
        {model.soundError && <Notice tone="warning">{model.soundError}</Notice>}
        {wakeLock.failed && (
          <Notice tone="warning">
            未能保持屏幕常亮（浏览器拒绝或处于省电模式），可点按「屏幕常亮」重试。
          </Notice>
        )}
      </div>
      <div className="space-y-4">
        {model.query.isPending && <LoadingState label="正在读取待送菜品…" />}
        {!model.query.isPending && !model.query.isError && model.items.length === 0 && (
          <EmptyState icon={HandPlatter} title="暂无待送菜品。" />
        )}
        <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {model.tables.map((table) => (
            <TableCard key={table.sessionId} table={table} model={model} />
          ))}
        </div>
        {model.query.hasNextPage && (
          <Button
            variant="outline"
            className="w-full"
            disabled={!model.view.active || model.query.isFetching}
            onClick={() => void model.query.fetchNextPage()}
          >
            加载更多菜品
          </Button>
        )}
      </div>
    </div>
  );
}

export function PassPage() {
  return (
    <AuthBoundary mode="account">
      {(account) => (
        <PassContent key={`${account.restaurantId}:${account.userId}`} account={account} />
      )}
    </AuthBoundary>
  );
}
