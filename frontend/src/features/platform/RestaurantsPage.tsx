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
import { MapLink, TemporaryPasswords, ThemeBadge, ThemeChoices } from "./ManagementViews";
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
import { DEFAULT_THEME, isTheme } from "@/lib/theme";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { platformSubscriptionMessages } from "@/features/subscriptions/messages";
import { platformMessages } from "./messages";

function Restaurants({ account }: { account: PlatformIdentity }) {
  const language = useStaffLanguage();
  const m = platformMessages[language];
  const s = platformSubscriptionMessages[language];
  const [filter, setFilter] = useState({
    search: "",
    status: "",
    subscriptionStatus: "",
    sort: "",
    page: 1,
  });
  const [annualInput, setAnnualInput] = useState("");
  const [includePeriod, setIncludePeriod] = useState(false);
  const [requireCode, setRequireCode] = useState(true);
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
      setCreateError(s.annualInvalid);
      return;
    }
    let initialPeriod = null;
    try {
      if (includePeriod) initialPeriod = periodFromForm(data, "create-period", randomUuid());
    } catch {
      setCreateError(s.periodInvalid);
      return;
    }
    if (
      initialPeriod &&
      !window.confirm(
        m.confirmInitialPeriod(
          initialPeriod.startsOn,
          initialPeriod.endsOn,
          initialPeriod.years,
          formatMoney(initialPeriod.amountCents, language),
          initialPeriod.paidOn,
        ),
      )
    )
      return;
    setCreateError("");
    const theme = data.get("theme");
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
      joinCodeRequired: requireCode,
      theme: isTheme(theme) ? theme : DEFAULT_THEME,
    };
    const ok = await actions.run({ kind: "create", restaurantId: id }, (signal) =>
      createRestaurant(input, signal),
    );
    if (ok) {
      form.reset();
      setAnnualInput("");
      setIncludePeriod(false);
      setRequireCode(true);
    }
  };
  return (
    <>
      <PlatformNavigation account={account} />
      <PageHeader title={m.restaurants} />
      <Card className="mb-6">
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{m.createTitle}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{m.createHint}</p>
          </div>
          <form onSubmit={create}>
            <fieldset
              className="grid gap-4 sm:grid-cols-2"
              disabled={
                actions.busy || actions.damaged || (!!actions.pending && !actions.missingCreate)
              }
            >
              {[
                ["name", m.name, 150],
                ["owner", m.ownerUsername, 50],
                ["staff", m.staffUsername, 50],
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
                <Label htmlFor="create-language">{m.menuLanguage}</Label>
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
              <div className="sm:col-span-2">
                <ThemeChoices name="theme" defaultValue={DEFAULT_THEME} />
              </div>
              <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
                <Checkbox
                  checked={requireCode}
                  onCheckedChange={(checked) => setRequireCode(checked)}
                />
                <span>
                  {m.requireCode}
                  <span className="block text-sm text-muted-foreground">{m.requireCodeHint}</span>
                </span>
              </label>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="create-contact">{m.ownerContact}</Label>
                <Textarea id="create-contact" name="ownerContact" maxLength={500} rows={3} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="create-maps">{m.mapsOptional}</Label>
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
                <Label htmlFor="create-annual">{m.annualFee}</Label>
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
                {m.includePeriod}
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
                {actions.missingCreate ? m.createAgain : m.create}
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
              {m.verify}
            </Button>
          }
        >
          <span className="break-all">{m.pendingRestaurant(actions.pending.restaurantId)}</span>
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
          <Label htmlFor="restaurant-search">{m.search}</Label>
          <Input id="restaurant-search" name="search" maxLength={150} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurant-status">{m.serviceStatus}</Label>
          <NativeSelect id="restaurant-status" name="status" className="w-full">
            <NativeSelectOption value="">{m.all}</NativeSelectOption>
            <NativeSelectOption value="ACTIVE">{m.statusActive}</NativeSelectOption>
            <NativeSelectOption value="SUSPENDED">{m.statusSuspended}</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurant-subscription">{m.subscriptionStatus}</Label>
          <NativeSelect id="restaurant-subscription" name="subscriptionStatus" className="w-full">
            <NativeSelectOption value="">{m.all}</NativeSelectOption>
            <NativeSelectOption value="UNPAID">{m.filterUnpaid}</NativeSelectOption>
            <NativeSelectOption value="DUE_SOON">{m.filterDueSoon}</NativeSelectOption>
            <NativeSelectOption value="EXPIRED">{m.filterExpired}</NativeSelectOption>
            <NativeSelectOption value="UNCONFIGURED">{m.filterUnconfigured}</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurant-sort">{m.sort}</Label>
          <NativeSelect id="restaurant-sort" name="sort" className="w-full">
            <NativeSelectOption value="">{m.sortNewest}</NativeSelectOption>
            <NativeSelectOption value="EXPIRY">{m.sortExpiry}</NativeSelectOption>
          </NativeSelect>
        </div>
        <Button type="submit">{m.filter}</Button>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>
          {m.refreshList}
        </Button>
      </form>
      {query.isPending && <LoadingState label={m.loadingRestaurants} />}
      {query.error && (
        <Notice tone="error">{errorMessage(query.error, undefined, language)}</Notice>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {query.data?.items.map((r) => (
          <article
            key={r.id}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs"
          >
            <h2 className="text-lg font-semibold wrap-break-word">{r.name}</h2>
            <div className="flex flex-wrap gap-2">
              <Badge variant={r.serviceStatus === "ACTIVE" ? "success" : "outline"}>
                {r.serviceStatus === "ACTIVE" ? m.serviceOn : m.serviceOff}
              </Badge>
              <Badge variant={r.orderingEnabled ? "secondary" : "outline"}>
                {r.orderingEnabled ? m.orderingOn : m.orderingOff}
              </Badge>
              {!r.joinCodeRequired && <Badge variant="outline">{m.noCode}</Badge>}
              <ThemeBadge theme={r.theme} />
            </div>
            {r.subscription && <SubscriptionStatus summary={r.subscription} />}
            <div className="mt-auto flex flex-wrap gap-2">
              <Link
                to="/platform/restaurants/$restaurantId"
                params={{ restaurantId: r.id }}
                className={buttonVariants({ variant: "outline", className: "flex-1" })}
              >
                {m.manage(r.name)}
              </Link>
              {r.googleMapsUrl && <MapLink url={r.googleMapsUrl} name={r.name} />}
            </div>
          </article>
        ))}
      </div>
      {query.data?.totalCount === 0 && <EmptyState icon={Store} title={m.noRestaurants} />}
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={filter.page <= 1 || query.isFetching}
          onClick={() => setFilter((f) => ({ ...f, page: f.page - 1 }))}
        >
          {m.previous}
        </Button>
        <span className="text-sm text-muted-foreground">
          {m.page(filter.page, query.data?.totalCount ?? 0)}
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
          {m.next}
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
