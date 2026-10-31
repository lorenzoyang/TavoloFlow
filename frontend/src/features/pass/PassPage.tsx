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
import { VisitTitle } from "@/components/visit-title";
import { staffMessages, visitTitle } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { useWakeLock } from "@/lib/useWakeLock";
import { cn } from "@/lib/utils";
import { passMessages } from "./messages";
import { passWaitLevel, type PassTable } from "./state";
import { usePass } from "./usePass";

const toggleStyle =
  "aria-pressed:border-primary/40 aria-pressed:bg-accent aria-pressed:text-accent-foreground";
const waitStyles = {
  normal: "bg-secondary text-secondary-foreground",
  late: "bg-warning text-warning-foreground",
};

function TableCard({ table, model }: { table: PassTable; model: ReturnType<typeof usePass> }) {
  const language = useStaffLanguage();
  const m = passMessages[language];
  const c = staffMessages[language];
  return (
    <article className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-xs">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 text-3xl font-bold wrap-break-word">
          <VisitTitle visit={table} language={language} />
        </h2>
        <span className="shrink-0 text-sm text-muted-foreground">
          {m.toServe(table.items.length)}
        </span>
      </header>
      <ul className="divide-y border-t">
        {table.items.map((item) => {
          const name = displayName(item, item.defaultLanguage, language);
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
                  {minutes === 0 ? m.justReady : m.waited(minutes)}
                </span>
              </div>
              {item.remark && (
                <p className="rounded-lg bg-secondary px-2.5 py-1.5 text-sm whitespace-pre-wrap wrap-break-word">
                  {c.remark(item.remark)}
                </p>
              )}
              <Button
                className="w-full"
                disabled={!model.fresh || model.busy.includes(item.id)}
                aria-label={m.servedLabel(visitTitle(table, language), name.text)}
                onClick={() => void model.serve(item)}
              >
                <Check />
                {m.served}
              </Button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function PassContent({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = passMessages[language];
  const c = staffMessages[language];
  const model = usePass(account);
  const wakeLock = useWakeLock();
  return (
    <div>
      <PageHeader
        title={m.title}
        description={m.description}
        back={{ to: "/staff", label: c.home }}
        actions={
          <>
            <Button
              variant="outline"
              className={toggleStyle}
              aria-pressed={model.sound}
              aria-label={c.sound}
              onClick={model.toggleSound}
            >
              {model.sound ? <Volume2 /> : <VolumeX />}
              <span className="hidden sm:inline">{c.sound}</span>
            </Button>
            {wakeLock.supported && (
              <Button
                variant="outline"
                className={toggleStyle}
                aria-pressed={wakeLock.enabled}
                aria-label={c.wakeLock}
                onClick={wakeLock.toggle}
              >
                <Sun />
                <span className="hidden sm:inline">{c.wakeLock}</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label={m.refresh}
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
          <p className="font-semibold">{m.totalToServe(model.head?.totalCount ?? "—")}</p>
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
            {model.head ? c.lastSync(formatDateTime(model.head.receivedAt, language)) : c.notSynced}
          </p>
        </div>
        {model.stalled && (
          <Notice tone="error">
            {!model.view.active ? c.disconnected : model.query.isPending ? m.syncing : m.maybeStale}{" "}
            {m.writesPaused}
          </Notice>
        )}
        {model.notice && <Notice>{model.notice}</Notice>}
        {(model.error || model.query.isError) && (
          <Notice tone="error">{model.error || m.readError}</Notice>
        )}
        {model.soundBlocked && (
          <Notice
            tone="warning"
            action={
              <Button variant="outline" onClick={model.unlockSound}>
                <Volume2 />
                {c.soundOn}
              </Button>
            }
          >
            {c.soundBlocked}
          </Notice>
        )}
        {model.soundUnsupported && <Notice tone="warning">{c.soundUnsupported}</Notice>}
        {wakeLock.failed && <Notice tone="warning">{c.wakeLockFailed}</Notice>}
      </div>
      <div className="space-y-4">
        {model.query.isPending && <LoadingState label={m.loading} />}
        {!model.query.isPending && !model.query.isError && model.items.length === 0 && (
          <EmptyState icon={HandPlatter} title={m.empty} />
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
            {m.loadMore}
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
