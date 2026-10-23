import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { ActiveBillPanel } from "@/features/billing/BillViews";
import { tablesKey } from "@/features/tables/api";
import { ApiError, errorMessage, withTimeout } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
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

type FloorProps = { sessionId?: string; select: (id: string) => void };
function FloorContent({
  account,
  sessionId = "",
  select: setSelected,
}: FloorProps & { account: CurrentAccount }) {
  const client = useQueryClient();
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
        setNotice(data.orderingEnabled ? "已核对：当前允许接单。" : "已核对：当前已暂停接单。");
      } else {
        const data = await readFloor(controller.signal);
        if (!mounted.current) return;
        client.setQueryData(floorQuery(account).queryKey, data);
        const table = data.tables.find((t) => t.id === pending.tableId);
        const result = recoveredOpen(table?.session?.id);
        if (result.kind === "active") {
          setSelected(result.sessionId);
          setNotice("已查到本桌当前用餐，请核对桌号；可主动查看入桌码。");
        } else {
          setSelected("");
          setNotice(
            table ? "已核对：当前为空桌。如需开桌，请重新确认。" : "此桌已不存在，请联系老板核对。",
          );
        }
      }
      remember(null);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e, "暂时无法核对，请恢复连接后重新读取。"));
    } finally {
      operation.current = null;
      if (mounted.current) setBusy(false);
    }
  }, [pending, client, account, remember, setSelected]);

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
      if (document.visibilityState === "visible" && navigator.onLine)
        setCode({ sessionId: result.session.sessionId, joinCode: result.joinCode });
      setNotice("开桌成功，请将本轮入桌码告知顾客。");
      remember(null);
      void refresh();
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.status < 500) remember(null);
      setError(errorMessage(e, "开桌结果待确认。请重新读取状态；系统不会自动重发开桌。"));
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
      setNotice(
        enabled
          ? "已允许接单；实际下单仍须餐厅服务和桌位可用。"
          : "已暂停新增订单，既有订单仍可核对。",
      );
      void refresh();
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.status < 500) remember(null);
      setError(errorMessage(e, "接单设置结果待确认，请重新读取状态。"));
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
        setError(errorMessage(e));
        void refresh();
      }
    } finally {
      operation.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-muted-foreground">{account.restaurantName}</p>
          <h1 className="text-2xl font-semibold">开桌工作台</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            核对桌号后开桌，将本轮入桌码告知顾客。
          </p>
        </div>
        <Link to="/staff" className={buttonVariants({ variant: "outline", className: "h-11" })}>
          <ArrowLeft />
          返回账号
        </Link>
      </header>
      {floor.data?.serviceStatus === "SUSPENDED" && (
        <Alert>
          <AlertDescription>
            餐厅服务已暂停，暂不能开新桌。已有用餐仍可核对并关闭空桌。
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {(error || floor.isError || session.isError || floor.fetchStatus === "paused") && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error || "无法更新状态，请检查连接后重新读取。"}</AlertDescription>
        </Alert>
      )}
      {pending && (
        <Alert role="status">
          <AlertDescription className="space-y-3">
            <p>
              {pending.kind === "accepting" ? "接单设置结果待确认" : "开桌结果待确认"}
              ，核对完成前暂停新的操作。
            </p>
            <Button className="h-11" disabled={busy} onClick={() => void recover()}>
              核对操作结果
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="h-11"
          disabled={busy || floor.isFetching}
          onClick={() => void refresh()}
        >
          <RefreshCw />
          重新读取状态
        </Button>
        <Link
          to="/staff/tables"
          className={buttonVariants({ variant: "outline", className: "h-11" })}
        >
          桌位管理
        </Link>
        <Link
          to="/staff/kitchen"
          className={buttonVariants({ variant: "outline", className: "h-11" })}
        >
          厨房工作台
        </Link>
        {account.role === "OWNER" && (
          <Link
            to="/staff/orders"
            search={{ sessionId: selected || undefined }}
            className={buttonVariants({ variant: "outline", className: "h-11" })}
          >
            结账工作台
          </Link>
        )}
      </div>
      {floor.data && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div>
              <h2 className="font-semibold">
                扫码接单：{floor.data.orderingEnabled ? "已开启" : "已暂停"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                暂停不结束用餐，已提交的订单仍可核对。
              </p>
            </div>
            <Button
              className="min-h-11"
              variant={floor.data.orderingEnabled ? "outline" : "default"}
              disabled={
                busy ||
                !!pending ||
                !!confirmation ||
                floor.isError ||
                floor.fetchStatus === "paused"
              }
              onClick={() => void setAccepting()}
            >
              {floor.data.orderingEnabled ? "暂停接单" : "开始接单"}
            </Button>
          </CardContent>
        </Card>
      )}
      {confirmation && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-lg font-semibold">确认开桌 · {confirmation.table.tableLabel}</h2>
            <div className="flex gap-3">
              <Button className="h-11" disabled={busy || !!pending} onClick={() => void submit()}>
                确认开桌
              </Button>
              <Button
                variant="outline"
                className="h-11"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {selected && session.data && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-xl font-semibold">本轮用餐 · {session.data.tableLabel}</h2>
            <p className="text-sm text-muted-foreground">
              开桌时间：{formatDateTime(session.data.openedAt)}
            </p>
            <Badge variant="secondary">
              {session.data.status === "ACTIVE" ? "用餐中" : "本轮已结束"}
            </Badge>
            {session.data.status === "ACTIVE" && (
              <>
                <p>已提交订单：{session.data.orderCount} 笔</p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    className="h-11"
                    variant="outline"
                    disabled={busy || !!pending}
                    onClick={() => void viewCode()}
                  >
                    查看入桌码
                  </Button>
                </div>
              </>
            )}
            {code?.sessionId === selected && session.data.status === "ACTIVE" && (
              <div className="space-y-2">
                <label htmlFor="staff-join-code" className="text-sm font-medium">
                  本轮入桌码 · 仅告知本桌顾客
                </label>
                <Input
                  id="staff-join-code"
                  readOnly
                  value={code.joinCode}
                  className="h-14 max-w-xs text-center text-2xl tracking-widest"
                  onFocus={(e) => e.target.select()}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {selected && (
        <ActiveBillPanel
          key={`${account.restaurantId}:${account.userId}:${selected}`}
          account={account}
          sessionId={selected}
        />
      )}
      {floor.isPending && <p role="status">正在读取桌位…</p>}
      {floor.data?.tables.length === 0 && <p>还没有桌位，请先到桌位管理添加。</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {floor.data?.tables.map((table) => (
          <Card key={table.id}>
            <CardContent className="space-y-4 pt-6">
              <h2 className="text-xl font-semibold wrap-break-word">{table.tableLabel}</h2>
              <div className="flex gap-2">
                <Badge variant="secondary">{table.session ? "用餐中" : "空桌"}</Badge>
                {!table.isEnabled && <Badge variant="outline">已停用</Badge>}
              </div>
              {table.session && (
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(table.session.openedAt)}
                </p>
              )}
              <Button
                className="h-11"
                disabled={
                  busy ||
                  !!pending ||
                  !!confirmation ||
                  (!table.session && (!table.isEnabled || floor.data.serviceStatus !== "ACTIVE"))
                }
                onClick={() => {
                  setCode(null);
                  setError("");
                  setNotice("");
                  if (table.session) setSelected(table.session.id);
                  else setConfirmation({ kind: "open", table });
                }}
              >
                {table.session ? "查看本轮用餐" : "开桌"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
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
