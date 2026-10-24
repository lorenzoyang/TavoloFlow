import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { readRestaurant, resetAccountPassword, setAccountActive, setServiceStatus } from "./api";
import { PlatformBoundary, PlatformNavigation } from "./PlatformAuth";
import { AccountActions, TemporaryPasswords } from "./ManagementViews";
import { useManagement } from "./useManagement";
import type { ManagedAccount } from "./state";
import type { PlatformIdentity } from "./identity";
import { PlatformSubscription } from "@/features/subscriptions/PlatformSubscription";

type Confirmation =
  | { kind: "reset" | "active"; account: ManagedAccount }
  | { kind: "status"; status: "ACTIVE" | "SUSPENDED" };
function RestaurantView({ identity, id }: { identity: PlatformIdentity; id: string }) {
  const query = useQuery({
    queryKey: ["platform", "restaurant", identity.userId, id],
    queryFn: ({ signal }) => readRestaurant(id, signal),
  });
  const actions = useManagement("platform", identity.userId);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const current =
    confirmation && confirmation.kind !== "status"
      ? query.data?.accounts.find((a) => a.id === confirmation.account.id)
      : null;
  const changed =
    confirmation?.kind === "status"
      ? query.data?.restaurant.serviceStatus !== confirmation.status
      : !!confirmation && current?.credentialVersion !== confirmation.account.credentialVersion;
  const locked =
    actions.busy ||
    !!actions.pending ||
    actions.damaged ||
    query.isError ||
    !query.data ||
    query.isFetching;
  const submit = async () => {
    if (!confirmation || locked || changed) return;
    const c = confirmation;
    setConfirmation(null);
    if (c.kind === "status") {
      const next = c.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      await actions.run({ kind: "status", restaurantId: id }, (signal) =>
        setServiceStatus(id, next, signal),
      );
    } else {
      const pending = {
        kind: c.kind,
        restaurantId: id,
        userId: c.account.id,
        expectedVersion: c.account.credentialVersion,
      };
      await actions.run(pending, (signal) =>
        c.kind === "reset"
          ? resetAccountPassword(id, c.account, signal)
          : setAccountActive(id, c.account, !c.account.isActive, signal),
      );
    }
  };
  return (
    <>
      <PlatformNavigation account={identity} />
      <h1 className="mb-5 text-2xl font-semibold">{query.data?.restaurant.name ?? "餐厅详情"}</h1>
      <Button className="mb-5 min-h-11" variant="outline" onClick={() => void query.refetch()}>
        刷新餐厅状态
      </Button>
      {query.isPending && <p role="status">正在读取…</p>}
      {query.error && <p role="alert">{errorMessage(query.error)}</p>}
      {query.data && (
        <>
          <section className="mb-5 space-y-3 rounded-xl border bg-card p-5">
            <p>
              {query.data.restaurant.serviceStatus === "ACTIVE" ? "服务已启用" : "服务已停用"} ·{" "}
              {query.data.restaurant.orderingEnabled ? "接单中" : "接单关闭"}
            </p>
            <p className="text-sm text-muted-foreground">
              {query.data.restaurant.currencyCode} · {query.data.restaurant.timeZone} · 默认菜单语言{" "}
              {query.data.restaurant.defaultLanguage}
            </p>
            <Button
              className="min-h-11"
              disabled={locked || !!confirmation}
              onClick={() =>
                setConfirmation({ kind: "status", status: query.data.restaurant.serviceStatus })
              }
            >
              {query.data.restaurant.serviceStatus === "ACTIVE" ? "停用餐厅服务" : "启用餐厅服务"}
            </Button>
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            {query.data.accounts.map((a) => (
              <AccountActions
                key={a.id}
                account={a}
                platform
                disabled={locked || !!confirmation}
                choose={(kind, account) => setConfirmation({ kind, account })}
              />
            ))}
          </div>
        </>
      )}
      {confirmation && (
        <section className="my-5 space-y-4 rounded-xl border bg-card p-5" aria-label="管理操作确认">
          <h2 className="font-semibold">确认操作 · {query.data?.restaurant.name}</h2>
          <p>
            {confirmation.kind === "status"
              ? confirmation.status === "ACTIVE"
                ? "停用服务将同时关闭接单，既有订单和账单仍可处理。"
                : "启用服务后，店铺仍须手动开启接单。"
              : `${confirmation.account.role} · ${confirmation.account.username}：${
                  confirmation.kind === "reset"
                    ? "重置后所有旧登录失效，须交付新临时密码并首次改密。账号启用状态不变。"
                    : confirmation.account.isActive
                      ? "禁用后所有旧登录失效。"
                      : "重新启用账号，原有旧登录仍然失效。"
                }`}
          </p>
          {changed && <p role="alert">状态已变化，请取消后重新核对。</p>}
          <Button className="min-h-11" disabled={locked || changed} onClick={() => void submit()}>
            确认执行
          </Button>
          <Button className="ml-3 min-h-11" variant="outline" onClick={() => setConfirmation(null)}>
            取消
          </Button>
        </section>
      )}
      {actions.message && (
        <p role="status" className="my-4">
          {actions.message}
        </p>
      )}
      {actions.pending && (
        <Button
          className="my-4 min-h-11"
          variant="outline"
          disabled={actions.busy}
          onClick={() => void actions.recover()}
        >
          查询原操作结果
        </Button>
      )}
      <TemporaryPasswords credentials={actions.secrets} close={actions.clearSecrets} />
      <PlatformSubscription userId={identity.userId} restaurantId={id} />
    </>
  );
}
export function RestaurantPage({ id }: { id: string }) {
  return (
    <PlatformBoundary>
      {(account) => <RestaurantView key={`${account!.userId}:${id}`} identity={account!} id={id} />}
    </PlatformBoundary>
  );
}
