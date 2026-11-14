import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Trash2 } from "lucide-react";
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
  deleteRestaurant,
  readRestaurant,
  resetAccountPassword,
  setAccountActive,
  setGoogleMapsUrl,
  setJoinCodeRequired,
  setServiceStatus,
  setServices,
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
import { isSlug, servicesValid, type ManagedAccount, type RestaurantServices } from "./state";
import { Checkbox } from "@/components/ui/checkbox";
import type { PlatformIdentity } from "./identity";
import { PlatformSubscription } from "@/features/subscriptions/PlatformSubscription";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { platformMessages } from "./messages";

type Confirmation =
  | { kind: "reset" | "active"; account: ManagedAccount }
  | { kind: "status"; status: "ACTIVE" | "SUSPENDED" }
  | { kind: "joinCode"; required: boolean }
  | { kind: "services"; from: RestaurantServices; to: RestaurantServices }
  | { kind: "slug"; from: string | null; to: string }
  | { kind: "delete" };
// status, required and from are the values the administrator saw; confirming switches them.
function describe(
  c: Exclude<Confirmation, { kind: "delete" }>,
  m: (typeof platformMessages)["zh"],
) {
  if (c.kind === "status") return c.status === "ACTIVE" ? m.suspendHint : m.activateHint;
  if (c.kind === "joinCode") return c.required ? m.codeOffHint : m.codeOnHint;
  if (c.kind === "services")
    return [
      c.from.dineIn !== c.to.dineIn && (c.to.dineIn ? m.dineInOnHint : m.dineInOffHint),
      c.from.online !== c.to.online && (c.to.online ? m.onlineOnHint : m.onlineOffHint),
    ]
      .filter(Boolean)
      .join(" ");
  if (c.kind === "slug") return c.from ? m.slugChangeHint(c.from, c.to) : m.slugSetHint(c.to);
  return m.accountHint(
    c.account.role,
    c.account.username,
    c.kind === "reset" ? m.resetHint : c.account.isActive ? m.disableHint : m.enableHint,
  );
}
function RestaurantView({ identity, id }: { identity: PlatformIdentity; id: string }) {
  const language = useStaffLanguage();
  const m = platformMessages[language];
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
  // The services the form proposes; null while the form is closed.
  const [serviceDraft, setServiceDraft] = useState<RestaurantServices | null>(null);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugError, setSlugError] = useState("");
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
          ? query.data?.restaurant.services.dineIn !== confirmation.from.dineIn ||
            query.data?.restaurant.services.online !== confirmation.from.online
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
      await actions.run({ kind: "services", restaurantId: id }, (signal) =>
        setServices(id, c.to, signal),
      );
    } else if (c.kind === "slug") {
      await actions.run({ kind: "slug", restaurantId: id }, (signal) => setSlug(id, c.to, signal));
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
  // Services and the link change what staff and customers can reach, so both go through the confirmation.
  const proposeServices = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const restaurant = query.data?.restaurant;
    if (locked || !restaurant || !serviceDraft) return;
    setConfirmation({ kind: "services", from: restaurant.services, to: serviceDraft });
    setServiceDraft(null);
  };
  const proposeSlug = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const restaurant = query.data?.restaurant;
    const value = String(new FormData(event.currentTarget).get("slug") ?? "").trim();
    if (locked || !restaurant) return;
    if (!isSlug(value)) {
      setSlugError(m.slugInvalid);
      return;
    }
    setSlugError("");
    setEditingSlug(false);
    if (value !== restaurant.slug)
      setConfirmation({ kind: "slug", from: restaurant.slug, to: value });
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
        <PageHeader title={deleted} back={{ to: "/platform/restaurants", label: m.backToList }} />
        <Notice tone="success">{m.deleted(deleted)}</Notice>
      </>
    );
  const restaurant = query.data?.restaurant;
  const accounts = query.data?.accounts ?? [];
  return (
    <>
      <PlatformNavigation account={identity} />
      <PageHeader
        title={restaurant?.name ?? m.detailTitle}
        back={{ to: "/platform/restaurants", label: m.backToList }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refreshRestaurant}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          </Button>
        }
      />
      {query.isPending && <LoadingState label={m.loading} />}
      {query.error && (
        <Notice tone="error">{errorMessage(query.error, undefined, language)}</Notice>
      )}
      {restaurant && (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={restaurant.serviceStatus === "ACTIVE" ? "success" : "outline"}>
                    {restaurant.serviceStatus === "ACTIVE" ? m.serviceOn : m.serviceOff}
                  </Badge>
                  <Badge variant={restaurant.orderingEnabled ? "secondary" : "outline"}>
                    {restaurant.orderingEnabled ? m.orderingOn : m.orderingOff}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {m.details(
                    restaurant.currencyCode,
                    restaurant.timeZone,
                    restaurant.defaultLanguage,
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {restaurant.googleMapsUrl ? (
                    <MapLink url={restaurant.googleMapsUrl} name={restaurant.name} />
                  ) : (
                    <span className="text-sm text-muted-foreground">{m.noMap}</span>
                  )}
                  <Button
                    variant="ghost"
                    disabled={locked || !!confirmation || editingMap}
                    onClick={() => setEditingMap(true)}
                  >
                    {m.editMap}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ThemeBadge theme={restaurant.theme} />
                  <Button
                    variant="ghost"
                    disabled={locked || !!confirmation || editingTheme}
                    onClick={() => setEditingTheme(true)}
                  >
                    {m.changeTheme}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {restaurant.joinCodeRequired ? m.codeRequired : m.codeNotRequired}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={locked || !!confirmation}
                    onClick={() =>
                      setConfirmation({ kind: "joinCode", required: restaurant.joinCodeRequired })
                    }
                  >
                    {restaurant.joinCodeRequired ? m.disableCode : m.enableCode}
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
                {restaurant.serviceStatus === "ACTIVE" ? m.suspendService : m.activateService}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3">
              <h2 className="font-semibold">{m.services}</h2>
              <p className="text-sm">
                {m.servicesSummary(restaurant.services.dineIn, restaurant.services.online)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm break-all text-muted-foreground">
                  {restaurant.slug ? m.onlineLink(restaurant.slug) : m.noSlug}
                </span>
                <Button
                  variant="ghost"
                  disabled={locked || !!confirmation || editingSlug}
                  onClick={() => {
                    setSlugError("");
                    setEditingSlug(true);
                  }}
                >
                  {restaurant.slug ? m.editSlug : m.setSlug}
                </Button>
              </div>
              <Button
                variant="outline"
                disabled={locked || !!confirmation || !!serviceDraft}
                onClick={() => setServiceDraft(restaurant.services)}
              >
                {m.editServices}
              </Button>
            </CardContent>
          </Card>
          {serviceDraft && (
            <form
              onSubmit={proposeServices}
              className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs"
              aria-label={m.servicesForm}
            >
              {(
                [
                  ["dineIn", m.serviceDineIn, m.serviceDineInHint],
                  ["online", m.serviceOnline, m.serviceOnlineHint],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    checked={serviceDraft[key]}
                    onCheckedChange={(checked) =>
                      setServiceDraft((current) => current && { ...current, [key]: checked })
                    }
                  />
                  <span>
                    {label}
                    <span className="block text-sm text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
              {serviceDraft.online && !restaurant.slug && (
                <Notice tone="warning">{m.servicesNeedSlug}</Notice>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={
                    locked ||
                    !servicesValid(serviceDraft, restaurant.slug) ||
                    (serviceDraft.dineIn === restaurant.services.dineIn &&
                      serviceDraft.online === restaurant.services.online)
                  }
                >
                  {m.saveServices}
                </Button>
                <Button type="button" variant="outline" onClick={() => setServiceDraft(null)}>
                  {m.cancel}
                </Button>
              </div>
            </form>
          )}
          {editingSlug && (
            <form
              onSubmit={proposeSlug}
              className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs"
              aria-label={m.slugForm}
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="restaurant-slug">{m.slugField}</Label>
                <Input
                  id="restaurant-slug"
                  name="slug"
                  maxLength={40}
                  defaultValue={restaurant.slug ?? ""}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="restaurant-slug-hint"
                  aria-invalid={!!slugError}
                />
                <p id="restaurant-slug-hint" className="text-sm text-muted-foreground">
                  {m.slugHint}
                </p>
              </div>
              {slugError && <Notice tone="error">{slugError}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={locked}>
                  {m.saveSlug}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingSlug(false)}>
                  {m.cancel}
                </Button>
              </div>
            </form>
          )}
          {editingMap && (
            <form
              onSubmit={saveMap}
              className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs"
              aria-label={m.editMapForm}
            >
              <div className="space-y-2">
                <Label htmlFor="restaurant-maps">{m.mapField}</Label>
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
                  {m.saveMap}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingMap(false)}>
                  {m.cancel}
                </Button>
              </div>
            </form>
          )}
          {editingTheme && (
            <form
              onSubmit={saveTheme}
              className="space-y-4 rounded-2xl border bg-card p-4 shadow-xs"
              aria-label={m.themeForm}
            >
              <ThemeChoices name="theme" defaultValue={restaurant.theme} />
              <p className="text-sm text-muted-foreground">{m.themeHint}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={locked}>
                  {m.saveTheme}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingTheme(false)}>
                  {m.cancel}
                </Button>
              </div>
            </form>
          )}
          {confirmation && (
            <section
              ref={panel}
              tabIndex={-1}
              aria-label={m.confirmRegion}
              className={cn(
                "space-y-4 rounded-2xl border border-primary/30 bg-card p-4 shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                confirmation.kind === "delete" && "border-destructive/50",
              )}
            >
              {confirmation.kind === "delete" ? (
                <>
                  <h2 className="font-semibold">{m.deleteTitle(restaurant.name)}</h2>
                  <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
                    {m.deleteConsequences.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div className="space-y-2">
                    <Label htmlFor="delete-restaurant-name">{m.typeName(restaurant.name)}</Label>
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
                  <h2 className="font-semibold">{m.confirmTitle(restaurant.name)}</h2>
                  <p className="text-sm leading-6">{describe(confirmation, m)}</p>
                </>
              )}
              {changed && <Notice tone="error">{m.stateChanged}</Notice>}
              <div className="flex flex-wrap gap-2">
                {confirmation.kind === "delete" ? (
                  <Button
                    variant="destructive"
                    disabled={locked || changed || !nameConfirmed}
                    onClick={() => void submit()}
                  >
                    {m.deleteForever}
                  </Button>
                ) : (
                  <Button disabled={locked || changed} onClick={() => void submit()}>
                    {m.confirm}
                  </Button>
                )}
                <Button variant="outline" onClick={closeConfirmation}>
                  {m.cancel}
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
                disabled={locked || !!confirmation}
                choose={(kind, account) => setConfirmation({ kind, account })}
              />
            ))}
          </div>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-semibold">{m.deleteSection}</h2>
                <p className="text-sm text-muted-foreground">
                  {restaurant.serviceStatus === "SUSPENDED" ? m.deleteReady : m.deleteBlocked}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={locked || !!confirmation || restaurant.serviceStatus !== "SUSPENDED"}
                onClick={() => setConfirmation({ kind: "delete" })}
              >
                <Trash2 />
                {m.deleteSection}
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
          {m.verify}
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
