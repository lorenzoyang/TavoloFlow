import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { errorMessage } from "@/lib/api";
import { PlatformBoundary, PlatformNavigation } from "./PlatformAuth";
import { TemporaryPasswords } from "./ManagementViews";
import { useManagement } from "./useManagement";
import { randomUuid } from "@/lib/ids";
import { createRestaurant, listRestaurants, RESTAURANTS_PAGE_SIZE } from "./api";
import type { PlatformIdentity } from "./identity";

function Restaurants({ account }: { account: PlatformIdentity }) {
  const [filter, setFilter] = useState({ search: "", status: "", page: 1 });
  const actions = useManagement("platform", account.userId);
  const query = useQuery({
    queryKey: ["platform", "restaurants", account.userId, filter],
    queryFn: ({ signal }) => listRestaurants(filter, signal),
  });
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const id = actions.pending?.kind === "create" ? actions.pending.restaurantId : randomUuid();
    const input = {
      id,
      name: String(data.get("name")),
      defaultLanguage: String(data.get("language")),
      ownerUsername: String(data.get("owner")),
      staffUsername: String(data.get("staff")),
    };
    const ok = await actions.run({ kind: "create", restaurantId: id }, (signal) =>
      createRestaurant(input, signal),
    );
    if (ok) form.reset();
  };
  return (
    <>
      <PlatformNavigation account={account} />
      <h1 className="mb-5 text-2xl font-semibold">餐厅管理</h1>
      <section className="mb-6 space-y-4 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">创建餐厅</h2>
        <p className="text-sm text-muted-foreground">
          新餐厅暂停服务、关闭接单。OWNER / STAFF 用随机临时密码登录后先改密，再完成菜单和桌位配置。
        </p>
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
                  className="h-11"
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="create-language">默认菜单语言</Label>
              <select
                id="create-language"
                name="language"
                defaultValue="zh"
                className="h-11 w-full rounded-md border bg-background px-3"
              >
                <option value="zh">中文</option>
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </select>
            </div>
            <Button className="min-h-11 sm:col-span-2" type="submit">
              {actions.missingCreate ? "确认按原编号再次创建" : "创建餐厅与两个账号"}
            </Button>
          </fieldset>
        </form>
      </section>
      {actions.message && (
        <p role="status" className="my-4">
          {actions.message}
        </p>
      )}
      {actions.pending && (
        <div className="mb-5 space-y-3">
          <p>结果待确认 · 餐厅编号 {actions.pending.restaurantId}</p>
          <Button variant="outline" disabled={actions.busy} onClick={() => void actions.recover()}>
            查询原操作结果
          </Button>
        </div>
      )}
      <TemporaryPasswords credentials={actions.secrets} close={actions.clearSecrets} />
      <form
        className="mb-5 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setFilter({
            search: String(data.get("search")).trim(),
            status: String(data.get("status")),
            page: 1,
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="restaurant-search">餐厅名称筛选</Label>
          <Input id="restaurant-search" name="search" maxLength={150} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurant-status">服务状态</Label>
          <select
            id="restaurant-status"
            name="status"
            className="h-11 rounded-md border bg-background px-3"
          >
            <option value="">全部</option>
            <option value="ACTIVE">已启用</option>
            <option value="SUSPENDED">已停用</option>
          </select>
        </div>
        <Button type="submit" className="h-11">
          筛选
        </Button>
        <Button
          type="button"
          className="h-11"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          刷新列表
        </Button>
      </form>
      {query.isPending && <p role="status">正在读取餐厅…</p>}
      {query.error && <p role="alert">{errorMessage(query.error)}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {query.data?.items.map((r) => (
          <article key={r.id} className="space-y-3 rounded-xl border bg-card p-5">
            <h2 className="text-lg font-semibold">{r.name}</h2>
            <p>
              {r.serviceStatus === "ACTIVE" ? "服务已启用" : "服务已停用"} ·{" "}
              {r.orderingEnabled ? "接单中" : "接单关闭"}
            </p>
            <Link
              to="/platform/restaurants/$restaurantId"
              params={{ restaurantId: r.id }}
              className={buttonVariants({ variant: "outline", className: "min-h-11" })}
            >
              管理 {r.name}
            </Link>
          </article>
        ))}
      </div>
      {query.data?.totalCount === 0 && <p>暂无匹配的餐厅。</p>}
      <div className="mt-5 flex items-center gap-3">
        <Button
          variant="outline"
          disabled={filter.page <= 1 || query.isFetching}
          onClick={() => setFilter((f) => ({ ...f, page: f.page - 1 }))}
        >
          上一页
        </Button>
        <span>
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
