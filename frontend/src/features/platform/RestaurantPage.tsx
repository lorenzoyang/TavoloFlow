import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { isTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  readRestaurant,
  resetAccountPassword,
  setAccountActive,
  setGoogleMapsUrl,
  setJoinCodeRequired,
  setServiceStatus,
  setTheme,
} from "./api";
import { PlatformBoundary, PlatformNavigation } from "./PlatformAuth";
import {
  AccountActions,
  MapLink,
  TemporaryPasswords,
  ThemeBadge,
  ThemeChoices,
} from "./ManagementViews";
import { useManagement } from "./useManagement";
import type { ManagedAccount } from "./state";
import type { PlatformIdentity } from "./identity";
import { PlatformSubscription } from "@/features/subscriptions/PlatformSubscription";

type Confirmation =
  | { kind: "reset" | "active"; account: ManagedAccount }
  | { kind: "status"; status: "ACTIVE" | "SUSPENDED" }
  | { kind: "joinCode"; required: boolean };
// status and required are the values the administrator saw; confirming switches them.
function describe(c: Confirmation) {
  if (c.kind === "status")
    return c.status === "ACTIVE"
      ? "停用服务将同时关闭接单，既有订单和账单仍可处理。"
      : "启用服务后，店铺仍须手动开启接单。";
  if (c.kind === "joinCode")
    return c.required
      ? "关闭后，开桌期间任何扫描本桌二维码的人都可直接加入并下单，对正在用餐的桌位立即生效。"
      : "开启后，新加入的顾客须输入入桌码；已加入的顾客授权保持有效，直到本轮结束或授权到期。";
  return `${c.account.role} · ${c.account.username}：${
    c.kind === "reset"
      ? "重置后所有旧登录失效，须交付新临时密码并首次改密。账号启用状态不变。"
      : c.account.isActive
        ? "禁用后所有旧登录失效。"
        : "重新启用账号，原有旧登录仍然失效。"
  }`;
}
function RestaurantView({ identity, id }: { identity: PlatformIdentity; id: string }) {
  const query = useQuery({
    queryKey: ["platform", "restaurant", identity.userId, id],
    queryFn: ({ signal }) => readRestaurant(id, signal),
  });
  const actions = useManagement("platform", identity.userId);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [editingMap, setEditingMap] = useState(false);
  const [editingTheme, setEditingTheme] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const current =
    confirmation?.kind === "reset" || confirmation?.kind === "active"
      ? query.data?.accounts.find((a) => a.id === confirmation.account.id)
      : null;
  const changed =
    confirmation?.kind === "status"
      ? query.data?.restaurant.serviceStatus !== confirmation.status
      : confirmation?.kind === "joinCode"
        ? query.data?.restaurant.joinCodeRequired !== confirmation.required
        : !!confirmation && current?.credentialVersion !== confirmation.account.credentialVersion;
  const locked =
    actions.busy ||
    !!actions.pending ||
    actions.damaged ||
    query.isError ||
    !query.data ||
    query.isFetching;
  // The confirmation may open far below the button that asked for it on a phone.
  const open = !!confirmation;
  useEffect(() => {
    if (!open) return;
    panel.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    panel.current?.focus({ preventScroll: true });
  }, [open]);
  const submit = async () => {
    if (!confirmation || locked || changed) return;
    const c = confirmation;
    setConfirmation(null);
    if (c.kind === "status") {
      const next = c.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      await actions.run({ kind: "status", restaurantId: id }, (signal) =>
        setServiceStatus(id, next, signal),
      );
    } else if (c.kind === "joinCode") {
      await actions.run({ kind: "joinCode", restaurantId: id }, (signal) =>
        setJoinCodeRequired(id, !c.required, signal),
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
  // Neither money nor irreversible: the link saves without the inline confirmation, and a blank value clears it.
  const saveMap = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked) return;
    const value = String(new FormData(event.currentTarget).get("googleMapsUrl") ?? "").trim();
    const saved = await actions.run({ kind: "maps", restaurantId: id }, (signal) =>
      setGoogleMapsUrl(id, value || null, signal),
    );
    if (saved) setEditingMap(false);
  };
  // Colours only, so no inline confirmation either; the next page load or poll applies it.
  const saveTheme = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const theme = new FormData(event.currentTarget).get("theme");
    if (locked || !isTheme(theme)) return;
    const saved = await actions.run({ kind: "theme", restaurantId: id }, (signal) =>
      setTheme(id, theme, signal),
    );
    if (saved) setEditingTheme(false);
  };
  const restaurant = query.data?.restaurant;
  const accounts = query.data?.accounts ?? [];
  return (
    <>
      <PlatformNavigation account={identity} />
      <PageHeader
        title={restaurant?.name ?? "餐厅详情"}
        back={{ to: "/platform/restaurants", label: "返回餐厅列表" }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label="刷新餐厅状态"
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          </Button>
        }
      />
      {query.isPending && <LoadingState label="正在读取…" />}
      {query.error && <Notice tone="error">{errorMessage(query.error)}</Notice>}
      {restaurant && (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={restaurant.serviceStatus === "ACTIVE" ? "success" : "outline"}>
                    {restaurant.serviceStatus === "ACTIVE" ? "服务已启用" : "服务已停用"}
                  </Badge>
                  <Badge variant={restaurant.orderingEnabled ? "secondary" : "outline"}>
                    {restaurant.orderingEnabled ? "接单中" : "接单关闭"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {restaurant.currencyCode} · {restaurant.timeZone} · 默认菜单语言{" "}
                  {restaurant.defaultLanguage}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {restaurant.googleMapsUrl ? (
                    <MapLink url={restaurant.googleMapsUrl} name={restaurant.name} />
                  ) : (
                    <span className="text-sm text-muted-foreground">尚未登记 Google 地图链接</span>
                  )}
                  <Button
                    variant="ghost"
                    disabled={locked || !!confirmation || editingMap}
                    onClick={() => setEditingMap(true)}
                  >
                    编辑地图链接
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ThemeBadge theme={restaurant.theme} />
                  <Button
                    variant="ghost"
                    disabled={locked || !!confirmation || editingTheme}
                    onClick={() => setEditingTheme(true)}
                  >
                    更换主题
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {restaurant.joinCodeRequired
                      ? "顾客须输入入桌码加入用餐"
                      : "免入桌码：顾客扫码即可直接加入用餐"}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={locked || !!confirmation}
                    onClick={() =>
                      setConfirmation({ kind: "joinCode", required: restaurant.joinCodeRequired })
                    }
                  >
                    {restaurant.joinCodeRequired ? "关闭入桌码" : "开启入桌码"}
                  </Button>
                </div>
              </div>
              <Button
                variant={restaurant.serviceStatus === "ACTIVE" ? "outline" : "default"}
                disabled={locked || !!confirmation}
                onClick={() =>
                  setConfirmation({ kind: "status", status: restaurant.serviceStatus })
                }
              >
                {restaurant.serviceStatus === "ACTIVE" ? "停用餐厅服务" : "启用餐厅服务"}
              </Button>
            </CardContent>
          </Card>
          {editingMap && (
            <form
              onSubmit={saveMap}
              className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs"
              aria-label="编辑 Google 地图链接"
            >
              <div className="space-y-2">
                <Label htmlFor="restaurant-maps">Google 地图链接（留空保存即清除）</Label>
                <Input
                  id="restaurant-maps"
                  name="googleMapsUrl"
                  type="url"
                  inputMode="url"
                  maxLength={2048}
                  defaultValue={restaurant.googleMapsUrl ?? ""}
                  placeholder="https://maps.app.goo.gl/…"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={locked}>
                  保存地图链接
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingMap(false)}>
                  取消
                </Button>
              </div>
            </form>
          )}
          {editingTheme && (
            <form
              onSubmit={saveTheme}
              className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs"
              aria-label="更换餐厅主题"
            >
              <ThemeChoices name="theme" defaultValue={restaurant.theme} />
              <p className="text-sm text-muted-foreground">
                只改变颜色，不影响布局和数据。顾客菜单约 30
                秒内更新，店铺页面在重新打开或切回前台时更新。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={locked}>
                  保存主题
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingTheme(false)}>
                  取消
                </Button>
              </div>
            </form>
          )}
          {confirmation && (
            <section
              ref={panel}
              tabIndex={-1}
              aria-label="管理操作确认"
              className="space-y-4 rounded-2xl border border-primary/30 bg-card p-4 shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <h2 className="font-semibold">确认操作 · {restaurant.name}</h2>
              <p className="text-sm leading-6">{describe(confirmation)}</p>
              {changed && <Notice tone="error">状态已变化，请取消后重新核对。</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button disabled={locked || changed} onClick={() => void submit()}>
                  确认执行
                </Button>
                <Button variant="outline" onClick={() => setConfirmation(null)}>
                  取消
                </Button>
              </div>
            </section>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((a) => (
              <AccountActions
                key={a.id}
                account={a}
                platform
                language="zh"
                disabled={locked || !!confirmation}
                choose={(kind, account) => setConfirmation({ kind, account })}
              />
            ))}
          </div>
        </div>
      )}
      {actions.message && <Notice className="my-4">{actions.message}</Notice>}
      {actions.pending && (
        <Button
          className="my-4"
          variant="outline"
          disabled={actions.busy}
          onClick={() => void actions.recover()}
        >
          查询原操作结果
        </Button>
      )}
      <TemporaryPasswords
        credentials={actions.secrets}
        close={actions.clearSecrets}
        language="zh"
      />
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
