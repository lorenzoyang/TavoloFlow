import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutGrid, RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { MasterDetail } from "@/components/master-detail";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { ActiveBillPanel } from "@/features/billing/BillViews";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import type { FloorTable } from "./api";
import { SessionSummary, TableTile } from "./FloorViews";
import { diningMessages } from "./messages";
import { useFloor } from "./useFloor";

type FloorProps = { sessionId?: string; select: (id: string) => void };

function FloorContent({
  account,
  sessionId: selected = "",
  select,
}: FloorProps & { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = diningMessages[language];
  const c = staffMessages[language];
  const model = useFloor(account, selected, select);
  const { floor, session, busy, pending } = model;

  // Opening a table needs a human confirmation.
  const [confirmation, setConfirmation] = useState<FloorTable | null>(null);
  async function confirmOpen() {
    if (!confirmation) return;
    await model.open(confirmation);
    setConfirmation(null);
  }

  const tables = floor.data?.tables ?? [];
  const dining = tables.filter((table) => table.session).length;
  const waiting = tables.reduce((n, table) => n + (table.session?.newItemCount ?? 0), 0);
  const writeLocked = busy || !!pending || !!confirmation;
  return (
    <div>
      <PageHeader
        title={m.title}
        description={account.restaurantName}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refresh}
            disabled={busy || floor.isFetching}
            onClick={() => void model.refresh()}
          >
            <RefreshCw className={cn(floor.isFetching && "animate-spin")} />
          </Button>
        }
      />
      <div className="mb-5 space-y-3">
        {floor.data?.serviceStatus === "SUSPENDED" && <Notice tone="warning">{m.suspended}</Notice>}
        {model.notice && <Notice>{model.notice}</Notice>}
        {(model.error || floor.isError || session.isError || floor.fetchStatus === "paused") && (
          <Notice tone="error">{model.error || m.readError}</Notice>
        )}
        {pending && (
          <Notice
            tone="warning"
            action={
              <Button disabled={busy} onClick={() => void model.recover()}>
                {m.verify}
              </Button>
            }
          >
            {m.pending(pending.kind)}
          </Notice>
        )}
        {floor.data && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-xs">
            <div className="min-w-0">
              <p id="accepting-orders" className="font-medium">
                {m.accepting}
              </p>
              <p className="text-sm leading-5 text-muted-foreground">
                {floor.data.orderingEnabled ? m.acceptingOn : m.acceptingOff}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {busy && pending?.kind === "accepting" && <Spinner />}
              <Switch
                aria-labelledby="accepting-orders"
                checked={floor.data.orderingEnabled}
                disabled={writeLocked || floor.isError || floor.fetchStatus === "paused"}
                onCheckedChange={() => void model.toggleAccepting()}
              />
            </div>
          </div>
        )}
      </div>
      <MasterDetail
        open={!!selected}
        title={session.data ? c.table(session.data.tableLabel) : m.visit}
        onClose={() => select("")}
        detail={
          selected && (
            <div className="space-y-6">
              <SessionSummary
                session={session.data}
                codeRequired={floor.data?.joinCodeRequired ?? true}
                code={model.code}
                disabled={busy || !!pending}
                viewCode={() => void model.viewCode()}
              />
              <ActiveBillPanel
                key={`${account.restaurantId}:${account.userId}:${selected}`}
                account={account}
                sessionId={selected}
              />
            </div>
          )
        }
      >
        {floor.isPending && <LoadingState label={m.loading} />}
        {floor.data?.tables.length === 0 && (
          <EmptyState
            icon={LayoutGrid}
            title={m.noTables}
            description={m.noTablesHint}
            action={
              <Link to="/staff/tables" className={buttonVariants({ variant: "outline" })}>
                {m.tablesLink}
              </Link>
            }
          />
        )}
        {tables.length > 0 && (
          <div className="@container space-y-3">
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-primary" />
                {m.dining(dining)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border bg-card" />
                {m.free(tables.filter((table) => !table.session && table.isEnabled).length)}
              </span>
              {waiting > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-warning" />
                  {m.waiting(waiting)}
                </span>
              )}
            </p>
            <div className="grid grid-cols-3 gap-3 @md:grid-cols-4 @2xl:grid-cols-5 @4xl:grid-cols-6">
              {tables.map((table) => (
                <TableTile
                  key={table.id}
                  table={table}
                  selected={!!table.session && table.session.id === selected}
                  disabled={
                    writeLocked ||
                    (!table.session && (!table.isEnabled || floor.data?.serviceStatus !== "ACTIVE"))
                  }
                  onSelect={() => {
                    model.clearFeedback();
                    if (table.session) select(table.session.id);
                    else setConfirmation(table);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </MasterDetail>
      <ConfirmDialog
        open={!!confirmation}
        title={m.openTitle(confirmation?.tableLabel ?? "")}
        description={floor.data?.joinCodeRequired === false ? m.openHintNoCode : m.openHint}
        confirmLabel={m.confirmOpen}
        busy={busy}
        confirmDisabled={!!pending}
        onConfirm={() => void confirmOpen()}
        onCancel={() => setConfirmation(null)}
      />
    </div>
  );
}

export function FloorPage(props: FloorProps) {
  return (
    <AuthBoundary mode="account">
      {(account) => (
        <FloorContent
          key={`${account.restaurantId}:${account.userId}`}
          account={account}
          {...props}
        />
      )}
    </AuthBoundary>
  );
}
