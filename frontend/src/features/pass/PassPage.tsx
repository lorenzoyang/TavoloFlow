import { Check, HandPlatter } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { SessionName } from "@/components/session-name";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { staffNavItems } from "@/features/accounts/navigation";
import { displayName } from "@/lib/language";
import { optionSummary } from "@/lib/options";
import { sessionTitle } from "@/lib/session-label";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { useWakeLock } from "@/lib/useWakeLock";
import { cn } from "@/lib/utils";
import { passMessages } from "./messages";
import { passWaitLevel, type PassTable } from "./state";
import { usePass } from "./usePass";
import { QueueDeviceNotices, QueueScreenActions, QueueSyncStatus } from "@/components/queue-screen";

const waitStyles = {
  normal: "bg-secondary text-secondary-foreground",
  late: "bg-warning text-warning-foreground",
};

function TableCard({ table, model }: { table: PassTable; model: ReturnType<typeof usePass> }) {
  const language = useStaffLanguage();
  const m = passMessages[language];
  const c = staffMessages[language];
  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-4 shadow-xs">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 text-3xl font-bold">
          <SessionName session={table} />
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
              {item.options.length > 0 && (
                <p className="font-medium wrap-break-word">
                  {optionSummary(item.options, item.defaultLanguage, language)}
                </p>
              )}
              {item.remark && (
                <p className="rounded-lg bg-secondary px-2.5 py-1.5 text-sm whitespace-pre-wrap wrap-break-word">
                  {c.remark(item.remark)}
                </p>
              )}
              <Button
                className="w-full"
                disabled={!model.fresh || model.busy.includes(item.id)}
                aria-label={m.servedLabel(sessionTitle(table, language), name.text)}
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
  // Only pages outside the tabs link back: Pass is a STAFF tab but an OWNER Home entry.
  const isTab = staffNavItems(account, language).some((item) => item.to === "/staff/pass");
  return (
    <div>
      <PageHeader
        title={m.title}
        description={m.description}
        back={isTab ? undefined : { to: "/staff", label: c.home }}
        actions={
          <QueueScreenActions
            audio={model}
            wakeLock={wakeLock}
            active={model.view.active}
            fetching={model.query.isFetching}
            refresh={model.refresh}
            refreshLabel={m.refresh}
          />
        }
      />
      <div className="mb-5 space-y-3">
        <QueueSyncStatus
          total={m.totalToServe(model.head?.totalCount ?? "—")}
          receivedAt={model.head?.receivedAt}
          stalled={model.stalled}
          active={model.view.active}
          pending={model.query.isPending}
          messages={m}
        />
        {model.notice && <Notice>{model.notice}</Notice>}
        {(model.error || model.query.isError) && (
          <Notice tone="error">{model.error || m.readError}</Notice>
        )}
        <QueueDeviceNotices audio={model} wakeLock={wakeLock} />
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
