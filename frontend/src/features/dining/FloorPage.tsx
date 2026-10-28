import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { tablesKey } from "@/features/tables/api";
import { ApiError, errorMessage, withTimeout } from "@/lib/api";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import {
  floorQuery,
  openTable,
  readFloor,
  readStaffJoinCode,
  sessionQuery,
  sessionKey,
  setAcceptingOrders,
  type FloorTable,
  type CodeResult,
} from "./api";
import {
  parsePendingAction,
  pendingDiningKey,
  recoveredOpen,
  type PendingDiningAction,
} from "./state";
import { SessionSummary, TableTile } from "./FloorViews";
import { diningMessages } from "./messages";

type FloorProps = { sessionId?: string; select: (id: string) => void };
function FloorContent({
  account,
  sessionId = "",
  select: setSelected,
}: FloorProps & { account: CurrentAccount }) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = diningMessages[language];
  const c = staffMessages[language];
  const floor = useQuery(floorQuery(account));
  const selected = sessionId;
  const session = useQuery(sessionQuery(account, selected));
  const key = pendingDiningKey(account.restaurantId, account.userId);
  const [pending, setPending] = useState<PendingDiningAction | null>(() => {
    try {
      return parsePendingAction(sessionStorage.getItem(key));
    } catch {
      return null;
    }
  });
  const [confirmation, setConfirmation] = useState<{ kind: "open"; table: FloorTable } | null>(
    null,
  );
  const [code, setCode] = useState<CodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const codeEpoch = useRef(0);
  const mounted = useRef(true);
  const remember = useCallback(
    (action: PendingDiningAction | null) => {
      setPending(action);
      try {
        if (action) sessionStorage.setItem(key, JSON.stringify(action));
        else sessionStorage.removeItem(key);
      } catch {
        /* GET recovery remains available. */
      }
    },
    [key],
  );

  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      codeEpoch.current++;
      setCode(null);
    };
    window.addEventListener("offline", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      operation.current?.abort();
      window.removeEventListener("offline", hide);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  useEffect(() => {
    // Synchronize protected display with failed/closed server state, including late reads.
    // oxlint-disable-next-line react/set-state-in-effect
    if (floor.isError || session.isError || session.data?.status === "CLOSED") setCode(null);
    if (floor.isError || session.isError || session.data?.status === "CLOSED") codeEpoch.current++;
  }, [floor.isError, session.isError, session.data?.status]);

  async function refresh() {
    await floor.refetch();
    if (selected) await session.refetch();
    void client.invalidateQueries({ queryKey: tablesKey(account) });
  }

  const recover = useCallback(async () => {
    if (!pending || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    setCode(null);
    try {
      if (pending.kind === "accepting") {
        const data = await readFloor(controller.signal);
        if (!mounted.current) return;
        client.setQueryData(floorQuery(account).queryKey, data);
        setNotice(m.checkedAccepting(data.orderingEnabled));
      } else {
        const data = await readFloor(controller.signal);
        if (!mounted.current) return;
        client.setQueryData(floorQuery(account).queryKey, data);
        const table = data.tables.find((t) => t.id === pending.tableId);
        const result = recoveredOpen(table?.session?.id);
        if (result.kind === "active") {
          setSelected(result.sessionId);
          setNotice(m.foundVisit(data.joinCodeRequired));
        } else {
          setSelected("");
          setNotice(table ? m.checkedFree : m.tableGone);
        }
      }
      remember(null);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e, m.recoverUnknown, language));
    } finally {
      operation.current = null;
      if (mounted.current) setBusy(false);
    }
  }, [pending, client, account, remember, setSelected, m, language]);

  useEffect(() => {
    // Schedule restoration after mount so StrictMode's setup/cleanup probe cannot abort the only recovery.
    const initial = window.setTimeout(() => {
      if (pending) void recover();
    }, 0);
    const check = () => {
      if (document.visibilityState === "visible") void recover();
    };
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [pending, recover]);

  async function submit() {
    if (!confirmation || operation.current || pending) return;
    const action: PendingDiningAction = { kind: "open", tableId: confirmation.table.id };
    const controller = new AbortController();
    operation.current = controller;
    const signal = withTimeout(controller.signal);
    remember(action);
    setBusy(true);
    setError("");
    setNotice("");
    setCode(null);
    try {
      const result = await openTable(action.tableId, signal);
      if (!mounted.current) return;
      setSelected(result.session.sessionId);
      client.setQueryData(sessionKey(account, result.session.sessionId), result.session);
      if (result.joinCode && document.visibilityState === "visible" && navigator.onLine)
        setCode({ sessionId: result.session.sessionId, joinCode: result.joinCode });
      setNotice(m.opened(!!result.joinCode));
      remember(null);
      void refresh();
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.status < 500) remember(null);
      setError(errorMessage(e, m.openUnknown, language));
      if (e instanceof ApiError && e.status === 409) void refresh();
    } finally {
      operation.current = null;
      if (mounted.current) {
        setBusy(false);
        setConfirmation(null);
      }
    }
  }

  async function setAccepting() {
    if (!floor.data || operation.current || pending) return;
    const enabled = !floor.data.orderingEnabled;
    const controller = new AbortController();
    operation.current = controller;
    remember({ kind: "accepting", enabled });
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await setAcceptingOrders(enabled, withTimeout(controller.signal));
      if (!mounted.current) return;
      remember(null);
      setNotice(m.acceptingSaved(enabled));
      void refresh();
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.status < 500) remember(null);
      setError(errorMessage(e, m.acceptingUnknown, language));
    } finally {
      operation.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  async function viewCode() {
    if (!selected || operation.current) return;
    const id = selected;
    const controller = new AbortController();
    operation.current = controller;
    const generation = ++codeEpoch.current;
    setBusy(true);
    setError("");
    try {
      const result = await readStaffJoinCode(id, controller.signal);
      if (
        mounted.current &&
        !controller.signal.aborted &&
        generation === codeEpoch.current &&
        document.visibilityState === "visible" &&
        navigator.onLine
      )
        setCode(result);
    } catch (e) {
      if (mounted.current) {
        setCode(null);
        setError(errorMessage(e, undefined, language));
        void refresh();
      }
    } finally {
      operation.current = null;
      if (mounted.current) setBusy(false);
    }
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
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn(floor.isFetching && "animate-spin")} />
          </Button>
        }
      />
      <div className="mb-5 space-y-3">
        {floor.data?.serviceStatus === "SUSPENDED" && <Notice tone="warning">{m.suspended}</Notice>}
        {notice && <Notice>{notice}</Notice>}
        {(error || floor.isError || session.isError || floor.fetchStatus === "paused") && (
          <Notice tone="error">{error || m.readError}</Notice>
        )}
        {pending && (
          <Notice
            tone="warning"
            action={
              <Button disabled={busy} onClick={() => void recover()}>
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
                onCheckedChange={() => void setAccepting()}
              />
            </div>
          </div>
        )}
      </div>
      <MasterDetail
        open={!!selected}
        title={session.data ? c.table(session.data.tableLabel) : m.visit}
        closeLabel={c.close}
        onClose={() => setSelected("")}
        detail={
          selected && (
            <div className="space-y-6">
              <SessionSummary
                session={session.data}
                codeRequired={floor.data?.joinCodeRequired ?? true}
                code={code}
                disabled={busy || !!pending}
                viewCode={() => void viewCode()}
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
                    setCode(null);
                    setError("");
                    setNotice("");
                    if (table.session) setSelected(table.session.id);
                    else setConfirmation({ kind: "open", table });
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </MasterDetail>
      <ConfirmDialog
        open={!!confirmation}
        title={m.openTitle(confirmation?.table.tableLabel ?? "")}
        description={floor.data?.joinCodeRequired === false ? m.openHintNoCode : m.openHint}
        confirmLabel={m.confirmOpen}
        cancelLabel={c.cancel}
        busy={busy}
        confirmDisabled={!!pending}
        onConfirm={() => void submit()}
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
