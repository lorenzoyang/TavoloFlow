import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { PlatformBoundary, PlatformNavigation } from "./PlatformAuth";
import { MapLink, TemporaryPasswords } from "./ManagementViews";
import { useManagement } from "./useManagement";
import { randomUuid } from "@/lib/ids";
import { createRestaurant, listRestaurants, RESTAURANTS_PAGE_SIZE } from "./api";
import type { PlatformIdentity } from "./identity";
import { PeriodFields } from "@/features/subscriptions/PeriodFields";
import { periodFromForm } from "@/features/subscriptions/state";
import { SubscriptionStatus } from "@/features/subscriptions/SubscriptionViews";
import { useSubscriptionQuery } from "@/features/subscriptions/queries";
import { formatMoney, parsePrice, RESTAURANT_TIME_ZONE } from "@/lib/format";
import { useLiveView } from "@/lib/useLiveView";

function Restaurants({ account }: { account: PlatformIdentity }) {
  const [filter, setFilter] = useState({
    search: "",
    status: "",
    subscriptionStatus: "",
    sort: "",
    page: 1,
  });
  const [annualInput, setAnnualInput] = useState("");
  const [includePeriod, setIncludePeriod] = useState(false);
  const [createError, setCreateError] = useState("");
  const live = useLiveView();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: RESTAURANT_TIME_ZONE }).format(
    new Date(live.now),
  );
  const actions = useManagement("platform", account.userId);
  const query = useSubscriptionQuery(
    ["platform", "restaurants", account.userId, filter],
    (signal) => listRestaurants(filter, signal),
  );
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const id = actions.pending?.kind === "create" ? actions.pending.restaurantId : randomUuid();
    const defaultAnnualFeeCents = annualInput.trim() ? parsePrice(annualInput, true) : null;
    if (annualInput.trim() && defaultAnnualFeeCents === null) {
      setCreateError("请填写最多两位小数的有效年费。");
      return;
    }
    let initialPeriod = null;
    try {
      if (includePeriod) initialPeriod = periodFromForm(data, "create-period", randomUuid());
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "请核对收费周期。");
      return;
    }
    if (
      initialPeriod &&
      !window.confirm(
        `确认登记 ${initialPeriod.startsOn} 至 ${initialPeriod.endsOn}，${initialPeriod.years} 年，总金额 ${formatMoney(initialPeriod.amountCents)}；${initialPeriod.paidOn ? `已付费，付费日期 ${initialPeriod.paidOn}` : "未付费"}？`,
      )
    )
      return;
    setCreateError("");
    const input = {
      id,
      name: String(data.get("name")),
      defaultLanguage: String(data.get("language")),
      ownerUsername: String(data.get("owner")),
      staffUsername: String(data.get("staff")),
      ownerContact: String(data.get("ownerContact") ?? "").trim() || null,
      googleMapsUrl: String(data.get("googleMapsUrl") ?? "").trim() || null,
      defaultAnnualFeeCents,
      initialPeriod,
    };
    const ok = await actions.run({ kind: "create", restaurantId: id }, (signal) =>
      createRestaurant(input, signal),
    );
    if (ok) {
      form.reset();
      setAnnualInput("");
      setIncludePeriod(false);
    }
  };
  return (
    <>
      <PlatformNavigation account={account} />
      <PageHeader title="餐厅管理" />
      <Card className="mb-6">
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">创建餐厅</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              新餐厅暂停服务、关闭接单。OWNER / STAFF
              用随机临时密码登录后先改密，再完成菜单和桌位配置。
            </p>
          </div>
          <form onSubmit={create}>
            <fieldset
              className="grid gap-4 sm:grid-cols-2"
              disabled={
                actions.busy || actions.damaged || (!!actions.pending && !actions.missingCreate)
              }
            >
              {[
                ["name", "餐厅名称", 150],
                ["owner", "OWNER 登录名", 50],
                ["staff", "STAFF 登录名", 50],
              ].map(([name, label, max]) => (
                <div key={name} className="space-y-2">
                  <Label htmlFor={`create-${name}`}>{label}</Label>
                  <Input
                    id={`create-${name}`}
                    name={String(name)}
                    required
                    maxLength={Number(max)}
                    autoComplete="off"
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="create-language">默认菜单语言</Label>
                <NativeSelect
                  id="create-language"
                  name="language"
                  defaultValue="zh"
                  className="w-full"
                >
                  <NativeSelectOption value="zh">中文</NativeSelectOption>
                  <NativeSelectOption value="it">Italiano</NativeSelectOption>
                  <NativeSelectOption value="en">English</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="create-contact">老板联系方式（可选）</Label>
                <Textarea id="create-contact" name="ownerContact" maxLength={500} rows={3} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="create-maps">Google 地图链接（可选）</Label>
                <Input
                  id="create-maps"
                  name="googleMapsUrl"
                  type="url"
                  inputMode="url"
                  maxLength={2048}
                  placeholder="https://maps.app.goo.gl/…"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="create-annual">默认年费（EUR，可选）</Label>
                <Input
                  id="create-annual"
                  inputMode="decimal"
                  value={annualInput}
                  onChange={(event) => setAnnualInput(event.target.value)}
                />
              </div>
              <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
                <Checkbox
                  checked={includePeriod}
                  onCheckedChange={(checked) => setIncludePeriod(checked)}
                />
                同时登记首个收费周期
              </label>
              {includePeriod && (
                <PeriodFields
                  prefix="create-period"
                  annualFee={parsePrice(annualInput, true)}
                  startsOn={today}
                  today={today}
                />
              )}
              {createError && (
                <Notice tone="error" className="sm:col-span-2">
                  {createError}
                </Notice>
              )}
              <Button size="lg" className="sm:col-span-2" type="submit">
                {actions.missingCreate ? "确认按原编号再次创建" : "创建餐厅与两个账号"}
              </Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
      {actions.message && <Notice className="my-4">{actions.message}</Notice>}
      {actions.pending && (
        <Notice
          tone="warning"
          className="mb-5"
          action={
            <Button
              variant="outline"
              disabled={actions.busy}
              onClick={() => void actions.recover()}
            >
              查询原操作结果
            </Button>
          }
        >
          <span className="break-all">结果待确认 · 餐厅编号 {actions.pending.restaurantId}</span>
        </Notice>
      )}
      <TemporaryPasswords credentials={actions.secrets} close={actions.clearSecrets} />
      <form
        className="mb-5 grid grid-cols-2 items-end gap-3 rounded-2xl border bg-card p-4 shadow-xs lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setFilter({
            search: String(data.get("search")).trim(),
            status: String(data.get("status")),
            subscriptionStatus: String(data.get("subscriptionStatus")),
            sort: String(data.get("sort")),
            page: 1,
          });
        }}
      >
        <div className="col-span-2 space-y-2 lg:col-span-1">
          <Label htmlFor="restaurant-search">餐厅名称筛选</Label>
          <Input id="restaurant-search" name="search" maxLength={150} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurant-status">服务状态</Label>
          <NativeSelect id="restaurant-status" name="status" className="w-full">
            <NativeSelectOption value="">全部</NativeSelectOption>
            <NativeSelectOption value="ACTIVE">已启用</NativeSelectOption>
            <NativeSelectOption value="SUSPENDED">已停用</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurant-subscription">年费状态</Label>
          <NativeSelect id="restaurant-subscription" name="subscriptionStatus" className="w-full">
            <NativeSelectOption value="">全部</NativeSelectOption>
            <NativeSelectOption value="UNPAID">已开始待收款</NativeSelectOption>
            <NativeSelectOption value="DUE_SOON">7 天内到期</NativeSelectOption>
            <NativeSelectOption value="EXPIRED">已到期</NativeSelectOption>
            <NativeSelectOption value="UNCONFIGURED">尚未登记</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurant-sort">排序</Label>
          <NativeSelect id="restaurant-sort" name="sort" className="w-full">
            <NativeSelectOption value="">最新创建</NativeSelectOption>
            <NativeSelectOption value="EXPIRY">截止日期从近到远</NativeSelectOption>
          </NativeSelect>
        </div>
        <Button type="submit">筛选</Button>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>
          刷新列表
        </Button>
      </form>
      {query.isPending && <LoadingState label="正在读取餐厅…" />}
      {query.error && <Notice tone="error">{errorMessage(query.error)}</Notice>}
      <div className="grid gap-4 md:grid-cols-2">
        {query.data?.items.map((r) => (
          <article
            key={r.id}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs"
          >
            <h2 className="text-lg font-semibold wrap-break-word">{r.name}</h2>
            <div className="flex flex-wrap gap-2">
              <Badge variant={r.serviceStatus === "ACTIVE" ? "success" : "outline"}>
                {r.serviceStatus === "ACTIVE" ? "服务已启用" : "服务已停用"}
              </Badge>
              <Badge variant={r.orderingEnabled ? "secondary" : "outline"}>
                {r.orderingEnabled ? "接单中" : "接单关闭"}
              </Badge>
            </div>
            {r.subscription && <SubscriptionStatus summary={r.subscription} />}
            <div className="mt-auto flex flex-wrap gap-2">
              <Link
                to="/platform/restaurants/$restaurantId"
                params={{ restaurantId: r.id }}
                className={buttonVariants({ variant: "outline", className: "flex-1" })}
              >
                管理 {r.name}
              </Link>
              {r.googleMapsUrl && <MapLink url={r.googleMapsUrl} name={r.name} />}
            </div>
          </article>
        ))}
      </div>
      {query.data?.totalCount === 0 && <EmptyState icon={Store} title="暂无匹配的餐厅。" />}
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={filter.page <= 1 || query.isFetching}
          onClick={() => setFilter((f) => ({ ...f, page: f.page - 1 }))}
        >
          上一页
        </Button>
        <span className="text-sm text-muted-foreground">
          第 {filter.page} 页 · 共 {query.data?.totalCount ?? 0} 家
        </span>
        <Button
          variant="outline"
          disabled={
            !query.data ||
            filter.page * RESTAURANTS_PAGE_SIZE >= query.data.totalCount ||
            query.isFetching
          }
          onClick={() => setFilter((f) => ({ ...f, page: f.page + 1 }))}
        >
          下一页
        </Button>
      </div>
    </>
  );
}
export function RestaurantsPage() {
  return (
    <PlatformBoundary>
      {(account) => <Restaurants key={account!.userId} account={account!} />}
    </PlatformBoundary>
  );
}
