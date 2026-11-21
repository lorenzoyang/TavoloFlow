import { InstallSection } from "@/features/accounts/InstallSection";
import { PushSection } from "@/features/push/PushSection";
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Plus, RefreshCw, Search, Store } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PlatformBoundary } from "./PlatformAuth";
import { rememberListSearch } from "./list-search";
import { useManagement } from "./useManagement";
import { listRestaurants, RESTAURANTS_PAGE_SIZE } from "./api";
import type { PlatformIdentity } from "./identity";
import { restaurantsSearch, type RestaurantsSearch } from "./state";
import { SubscriptionStatus } from "@/features/subscriptions/SubscriptionViews";
import { PlatformSubscriptionReminders } from "@/features/subscriptions/SubscriptionReminders";
import { useSubscriptionQuery } from "@/features/subscriptions/queries";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { platformMessages } from "./messages";

type ListProps = {
  search: RestaurantsSearch;
  navigate: (search: RestaurantsSearch) => void;
};

function Restaurants({ account, search, navigate }: ListProps & { account: PlatformIdentity }) {
  const language = useStaffLanguage();
  const m = platformMessages[language];
  // Only for a pending write from another platform page: its notice and GET-only recovery.
  const actions = useManagement("platform", account.userId);
  const query = useSubscriptionQuery(
    ["platform", "restaurants", account.userId, search],
    (signal) => listRestaurants(search, signal),
  );
  const page = search.page ?? 1;
  useEffect(() => rememberListSearch(search), [search]);
  // Changing a filter goes back to the first page; the validator drops "all" and page 1 from the URL.
  const filter = (next: Record<string, unknown>) =>
    navigate(restaurantsSearch({ ...search, ...next, page: undefined }));
  return (
    <>
      <PageHeader
        title={m.restaurants}
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={m.refreshList}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className={cn(query.isFetching && "animate-spin")} />
            </Button>
            {/* Only the icon on phones, so the page title keeps its width. */}
            <Link
              to="/platform/restaurants/new"
              aria-label={m.createTitle}
              className={buttonVariants({ className: "max-sm:size-11 max-sm:px-0" })}
            >
              <Plus />
              <span className="max-sm:hidden">{m.createTitle}</span>
            </Link>
          </>
        }
      />
      <PlatformSubscriptionReminders userId={account.userId} />
      {actions.pending && (
        <Notice
          tone="warning"
          className="mb-4"
          action={
            <Button
              variant="outline"
              disabled={actions.busy}
              onClick={() => void actions.recover()}
            >
              {m.verify}
            </Button>
          }
        >
          <span className="break-all">{m.pendingRestaurant(actions.pending.restaurantId)}</span>
        </Notice>
      )}
      {actions.message && <Notice className="mb-4">{actions.message}</Notice>}
      <div className="mb-5 grid grid-cols-2 items-end gap-3 rounded-2xl bg-card p-4 shadow-xs ring-1 ring-foreground/10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <form
          role="search"
          className="col-span-2 space-y-2 lg:col-span-1"
          onSubmit={(event) => {
            event.preventDefault();
            filter({ search: new FormData(event.currentTarget).get("search") });
          }}
        >
          <Label htmlFor="restaurant-search">{m.search}</Label>
          <div className="flex gap-2">
            <Input
              key={search.search ?? ""}
              id="restaurant-search"
              name="search"
              type="search"
              maxLength={150}
              defaultValue={search.search ?? ""}
            />
            <Button type="submit" variant="outline" size="icon" aria-label={m.searchAction}>
              <Search />
            </Button>
          </div>
        </form>
        <div className="space-y-2">
          <Label htmlFor="restaurant-status">{m.serviceStatus}</Label>
          <NativeSelect
            id="restaurant-status"
            className="w-full"
            value={search.status ?? ""}
            onChange={(event) => filter({ status: event.target.value })}
          >
            <NativeSelectOption value="">{m.all}</NativeSelectOption>
            <NativeSelectOption value="ACTIVE">{m.statusActive}</NativeSelectOption>
            <NativeSelectOption value="SUSPENDED">{m.statusSuspended}</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurant-subscription">{m.subscriptionStatus}</Label>
          <NativeSelect
            id="restaurant-subscription"
            className="w-full"
            value={search.subscriptionStatus ?? ""}
            onChange={(event) => filter({ subscriptionStatus: event.target.value })}
          >
            <NativeSelectOption value="">{m.all}</NativeSelectOption>
            <NativeSelectOption value="UNPAID">{m.filterUnpaid}</NativeSelectOption>
            <NativeSelectOption value="DUE_SOON">{m.filterDueSoon}</NativeSelectOption>
            <NativeSelectOption value="EXPIRED">{m.filterExpired}</NativeSelectOption>
            <NativeSelectOption value="UNCONFIGURED">{m.filterUnconfigured}</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="col-span-2 space-y-2 lg:col-span-1">
          <Label htmlFor="restaurant-sort">{m.sort}</Label>
          <NativeSelect
            id="restaurant-sort"
            className="w-full"
            value={search.sort ?? ""}
            onChange={(event) => filter({ sort: event.target.value })}
          >
            <NativeSelectOption value="">{m.sortNewest}</NativeSelectOption>
            <NativeSelectOption value="EXPIRY">{m.sortExpiry}</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      {query.isPending && <LoadingState label={m.loadingRestaurants} />}
      {query.error && (
        <Notice tone="error">{errorMessage(query.error, undefined, language)}</Notice>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {query.data?.items.map((r) => (
          <Link
            key={r.id}
            to="/platform/restaurants/$restaurantId"
            params={{ restaurantId: r.id }}
            className="flex min-w-0 flex-col gap-3 rounded-2xl bg-card p-4 shadow-xs ring-1 ring-foreground/10 transition-colors outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-lg font-semibold wrap-break-word">{r.name}</span>
              <ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0" />
            </span>
            <span className="flex flex-wrap gap-2">
              <Badge variant={r.serviceStatus === "ACTIVE" ? "success" : "outline"}>
                {r.serviceStatus === "ACTIVE" ? m.serviceOn : m.serviceOff}
              </Badge>
              {r.services.dineIn && <Badge variant="secondary">{m.serviceDineIn}</Badge>}
              {r.services.online && <Badge variant="secondary">{m.serviceOnline}</Badge>}
            </span>
            {r.subscription && <SubscriptionStatus summary={r.subscription} />}
          </Link>
        ))}
      </div>
      {query.data?.totalCount === 0 && <EmptyState icon={Store} title={m.noRestaurants} />}
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={page <= 1 || query.isFetching}
          onClick={() => navigate({ ...search, page: page - 1 > 1 ? page - 1 : undefined })}
        >
          {m.previous}
        </Button>
        <span className="text-sm text-muted-foreground">
          {m.page(page, query.data?.totalCount ?? 0)}
        </span>
        <Button
          variant="outline"
          disabled={
            !query.data || page * RESTAURANTS_PAGE_SIZE >= query.data.totalCount || query.isFetching
          }
          onClick={() => navigate({ ...search, page: page + 1 })}
        >
          {m.next}
        </Button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <PushSection platform />
        <InstallSection scope="/platform" />
      </div>
    </>
  );
}
export function RestaurantsPage(props: ListProps) {
  return (
    <PlatformBoundary>
      {(account) => <Restaurants key={account!.userId} account={account!} {...props} />}
    </PlatformBoundary>
  );
}
