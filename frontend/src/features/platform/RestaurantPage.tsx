import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Trash2 } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { isSlug, normalizePhone, suggestSlug } from "@/lib/pickup-rules";
import { isTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  deleteRestaurant,
  readRestaurant,
  resetAccountPassword,
  setAccountActive,
  setGoogleMapsUrl,
  setJoinCodeRequired,
  setPhone,
  setServices,
  setServiceStatus,
  setSlug,
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

type Services = { dineIn: boolean; pickup: boolean };
type Confirmation =
  | { kind: "reset" | "active"; account: ManagedAccount }
  | { kind: "status"; status: "ACTIVE" | "SUSPENDED" }
  | { kind: "joinCode"; required: boolean }
  | { kind: "services"; from: Services; to: Services }
  | { kind: "slug"; from: string | null; to: string | null }
  | { kind: "delete" };
// status and required are the values the administrator saw; confirming switches them.
function describe(c: Exclude<Confirmation, { kind: "delete" }>) {
  if (c.kind === "status")
    return c.status === "ACTIVE"
      ? "停用服务将同时关闭接单，既有订单和账单仍可处理。"
      : "启用服务后，店铺仍须手动开启接单。";
  if (c.kind === "services")
    return [
      c.from.dineIn !== c.to.dineIn &&
        (c.to.dineIn
          ? "开通堂食：店铺出现桌台页，顾客可以扫桌台二维码点餐。"
          : "关闭堂食：桌台页和扫码点餐停用，扫码只能浏览菜单；有用餐中的桌时会被拒绝。"),
      c.from.pickup !== c.to.pickup &&
        (c.to.pickup
          ? "开通线上自取：店铺首页出现“线上点单”，老板设置营业时间后，顾客可以在线上菜单下单。"
          : "关闭线上自取：线上菜单只能浏览，顾客不能下单；有待接单的请求或未完成的自取单时会被拒绝。"),
    ]
      .filter(Boolean)
      .join(" ");
  if (c.kind === "slug")
    return c.from
      ? `旧链接 /r/${c.from} 和为它印的二维码（传单、外卖袋等）会立即失效${
          c.to ? `，新链接为 /r/${c.to}` : ""
        }；桌台二维码不受影响。`
      : `线上菜单链接将设为 /r/${c.to}。`;
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
  // The name of the restaurant this page deleted; the page stops reading it from then on.
  const [deleted, setDeleted] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["platform", "restaurant", identity.userId, id],
    queryFn: ({ signal }) => readRestaurant(id, signal),
    enabled: deleted === null,
  });
  const actions = useManagement("platform", identity.userId);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // Typing the name guards against deleting the wrong restaurant; it lives only in this state.
  const [typedName, setTypedName] = useState("");
  const [editingMap, setEditingMap] = useState(false);
  const [editingTheme, setEditingTheme] = useState(false);
  const [editingServices, setEditingServices] = useState<Services | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [formError, setFormError] = useState("");
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
        : confirmation?.kind === "services"
          ? query.data?.restaurant.dineInEnabled !== confirmation.from.dineIn ||
            query.data?.restaurant.pickupEnabled !== confirmation.from.pickup
          : confirmation?.kind === "slug"
            ? query.data?.restaurant.slug !== confirmation.from
            : confirmation?.kind === "delete"
              ? query.data?.restaurant.serviceStatus !== "SUSPENDED"
              : !!confirmation &&
                current?.credentialVersion !== confirmation.account.credentialVersion;
  const nameConfirmed = typedName.trim() === query.data?.restaurant.name;
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
  const closeConfirmation = () => {
    setConfirmation(null);
    setTypedName("");
  };
  const submit = async () => {
    if (!confirmation || locked || changed || (confirmation.kind === "delete" && !nameConfirmed))
      return;
    const c = confirmation;
    const name = query.data!.restaurant.name;
    closeConfirmation();
    if (c.kind === "delete") {
      if (
        await actions.run({ kind: "delete", restaurantId: id }, (signal) =>
          deleteRestaurant(id, signal),
        )
      )
        setDeleted(name);
    } else if (c.kind === "status") {
      const next = c.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      await actions.run({ kind: "status", restaurantId: id }, (signal) =>
        setServiceStatus(id, next, signal),
      );
    } else if (c.kind === "joinCode") {
      await actions.run({ kind: "joinCode", restaurantId: id }, (signal) =>
        setJoinCodeRequired(id, !c.required, signal),
      );
    } else if (c.kind === "services") {
      if (
        await actions.run({ kind: "services", restaurantId: id }, (signal) =>
          setServices(id, c.to.dineIn, c.to.pickup, signal),
        )
      )
        setEditingServices(null);
    } else if (c.kind === "slug") {
      if (
        await actions.run({ kind: "slug", restaurantId: id }, (signal) => setSlug(id, c.to, signal))
      )
        setEditingSlug(false);
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
  // A single column, like the map link: no inline confirmation. Pickup needs it, so it cannot be cleared then.
  const savePhone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked) return;
    const text = String(new FormData(event.currentTarget).get("phone") ?? "").trim();
    const phone = text ? normalizePhone(text) : null;
    if (text && !phone) {
      setFormError("电话须为可选 + 加 6–15 位数字。");
      return;
    }
    setFormError("");
    const saved = await actions.run({ kind: "phone", restaurantId: id }, (signal) =>
      setPhone(id, phone, signal),
    );
    if (saved) setEditingPhone(false);
  };
  // The link name changes only after the inline confirmation, because the old link stops working.
  const reviewSlug = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked || !query.data) return;
    const text = String(new FormData(event.currentTarget).get("slug") ?? "")
      .trim()
      .toLowerCase();
    if (text && !isSlug(text)) {
      setFormError("链接名须为 3–40 个小写字母、数字或连字符，不以连字符开头或结尾。");
      return;
    }
    setFormError("");
    if ((text || null) === query.data.restaurant.slug) {
      setEditingSlug(false);
      return;
    }
    setConfirmation({ kind: "slug", from: query.data.restaurant.slug, to: text || null });
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
  if (deleted !== null)
    return (
      <>
        <PlatformNavigation account={identity} />
        <PageHeader title={deleted} back={{ to: "/platform/restaurants", label: "返回餐厅列表" }} />
        <Notice tone="success">已永久删除「{deleted}」及其全部数据。</Notice>
      </>
    );
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
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={restaurant.dineInEnabled ? "secondary" : "outline"}>
                    {restaurant.dineInEnabled ? "堂食已开通" : "堂食未开通"}
                  </Badge>
                  <Badge variant={restaurant.pickupEnabled ? "secondary" : "outline"}>
                    {restaurant.pickupEnabled
                      ? restaurant.pickupPaused
                        ? "线上自取已开通 · 店铺已暂停"
                        : "线上自取已开通"
                      : "线上自取未开通"}
                  </Badge>
                  <Button
                    variant="ghost"
                    disabled={locked || !!confirmation || !!editingServices}
                    onClick={() =>
                      setEditingServices({
                        dineIn: restaurant.dineInEnabled,
                        pickup: restaurant.pickupEnabled,
                      })
                    }
                  >
                    修改服务
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    电话：{restaurant.phone ?? "未登记"}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={locked || !!confirmation || editingPhone}
                    onClick={() => setEditingPhone(true)}
                  >
                    编辑电话
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm break-all text-muted-foreground">
                    线上菜单：{restaurant.slug ? `/r/${restaurant.slug}` : "未设置链接名"}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={locked || !!confirmation || editingSlug}
                    onClick={() => setEditingSlug(true)}
                  >
                    修改链接名
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
          {editingServices && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (locked) return;
                const from = { dineIn: restaurant.dineInEnabled, pickup: restaurant.pickupEnabled };
                if (!editingServices.dineIn && !editingServices.pickup) {
                  setFormError("至少开通一项服务。");
                  return;
                }
                setFormError("");
                if (
                  from.dineIn === editingServices.dineIn &&
                  from.pickup === editingServices.pickup
                ) {
                  setEditingServices(null);
                  return;
                }
                setConfirmation({ kind: "services", from, to: editingServices });
              }}
              className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs"
              aria-label="修改服务"
            >
              <label className="flex min-h-11 items-center gap-3">
                <Checkbox
                  checked={editingServices.dineIn}
                  onCheckedChange={(dineIn) => setEditingServices({ ...editingServices, dineIn })}
                />
                堂食扫码点餐
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <Checkbox
                  checked={editingServices.pickup}
                  onCheckedChange={(pickup) => setEditingServices({ ...editingServices, pickup })}
                />
                <span>
                  线上自取
                  <span className="block text-sm text-muted-foreground">
                    须已登记电话和线上菜单链接名。
                  </span>
                </span>
              </label>
              {formError && <Notice tone="error">{formError}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={locked || !!confirmation}>
                  核对修改
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingServices(null);
                    setFormError("");
                  }}
                >
                  取消
                </Button>
              </div>
            </form>
          )}
          {editingPhone && (
            <form
              onSubmit={savePhone}
              className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs"
              aria-label="编辑餐厅电话"
            >
              <div className="space-y-2">
                <Label htmlFor="restaurant-phone">
                  餐厅电话（顾客在线上订单状态页拨打；开通自取期间不能清空）
                </Label>
                <Input
                  id="restaurant-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  maxLength={32}
                  defaultValue={restaurant.phone ?? ""}
                  placeholder="+39 06 1234567"
                  autoComplete="off"
                />
              </div>
              {formError && <Notice tone="error">{formError}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={locked}>
                  保存电话
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingPhone(false);
                    setFormError("");
                  }}
                >
                  取消
                </Button>
              </div>
            </form>
          )}
          {editingSlug && (
            <form
              onSubmit={reviewSlug}
              className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs"
              aria-label="修改线上菜单链接名"
            >
              <div className="space-y-2">
                <Label htmlFor="restaurant-slug">
                  线上菜单链接名（3–40 个小写字母、数字或连字符；开通自取期间不能清空）
                </Label>
                <Input
                  id="restaurant-slug"
                  name="slug"
                  maxLength={40}
                  defaultValue={restaurant.slug ?? suggestSlug(restaurant.name)}
                  placeholder="trattoria-roma"
                  autoComplete="off"
                />
              </div>
              {formError && <Notice tone="error">{formError}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={locked || !!confirmation}>
                  核对修改
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingSlug(false);
                    setFormError("");
                  }}
                >
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
              className={cn(
                "space-y-4 rounded-2xl border border-primary/30 bg-card p-4 shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                confirmation.kind === "delete" && "border-destructive/50",
              )}
            >
              {confirmation.kind === "delete" ? (
                <>
                  <h2 className="font-semibold">确认永久删除 · {restaurant.name}</h2>
                  <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
                    <li>
                      将删除老板和员工账号、桌台与二维码（已打印的桌卡失效）、菜单与菜品照片、全部就餐记录、订单和账单历史（包括未结账单）、服务期与收费记录。
                    </li>
                    <li>店里已登录的设备会在下一次请求时退出，顾客扫码会看到二维码无效。</li>
                    <li>
                      删除不能撤销：数据只会在此后 7
                      天内的每日备份里残留，而恢复备份会回滚整个系统，不能只恢复这一家餐厅。
                    </li>
                  </ul>
                  <div className="space-y-2">
                    <Label htmlFor="delete-restaurant-name">
                      输入餐厅名称「{restaurant.name}」以确认
                    </Label>
                    <Input
                      id="delete-restaurant-name"
                      value={typedName}
                      onChange={(event) => setTypedName(event.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </>
              ) : (
                <>
                  <h2 className="font-semibold">确认操作 · {restaurant.name}</h2>
                  <p className="text-sm leading-6">{describe(confirmation)}</p>
                </>
              )}
              {changed && <Notice tone="error">状态已变化，请取消后重新核对。</Notice>}
              <div className="flex flex-wrap gap-2">
                {confirmation.kind === "delete" ? (
                  <Button
                    variant="destructive"
                    disabled={locked || changed || !nameConfirmed}
                    onClick={() => void submit()}
                  >
                    永久删除
                  </Button>
                ) : (
                  <Button disabled={locked || changed} onClick={() => void submit()}>
                    确认执行
                  </Button>
                )}
                <Button variant="outline" onClick={closeConfirmation}>
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
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-semibold">永久删除餐厅</h2>
                <p className="text-sm text-muted-foreground">
                  {restaurant.serviceStatus === "SUSPENDED"
                    ? "删除这家餐厅及其全部数据，无法撤销。"
                    : "须先停用餐厅服务，才能永久删除。"}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={locked || !!confirmation || restaurant.serviceStatus !== "SUSPENDED"}
                onClick={() => setConfirmation({ kind: "delete" })}
              >
                <Trash2 />
                永久删除餐厅
              </Button>
            </CardContent>
          </Card>
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
