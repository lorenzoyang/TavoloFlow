import { useRef, useState, type FormEvent } from "react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api";
import { LANGUAGE_NAMES } from "@/lib/language";
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
import { PlatformBoundary } from "./PlatformAuth";
import {
  AccountRow,
  Section,
  SettingRow,
  TemporaryPasswords,
  ThemeChoices,
  ThemeName,
} from "./ManagementViews";
import { listSearch } from "./list-search";
import { useManagement } from "./useManagement";
import { isSlug, type ManagedAccount, type RestaurantServices } from "./state";
import type { PlatformIdentity } from "./identity";
import { platformSubscriptionKey } from "@/features/subscriptions/api";
import { PlatformSubscription } from "@/features/subscriptions/PlatformSubscription";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { platformMessages } from "./messages";

type Messages = (typeof platformMessages)["zh"];
type Confirmation =
  | { kind: "reset" | "active"; account: ManagedAccount }
  | { kind: "status"; status: "ACTIVE" | "SUSPENDED" }
  | { kind: "joinCode"; required: boolean }
  | { kind: "services"; from: RestaurantServices; to: RestaurantServices }
  | { kind: "slug"; from: string | null; to: string }
  | { kind: "delete" };
// The card a write started from shows its result; null is the page top, where results recovered
// after a reload also appear.
type Origin = "features" | "appearance" | "accounts" | "danger" | null;

// status, required and from are the values the administrator saw; confirming switches them.
function describe(c: Exclude<Confirmation, { kind: "delete" }>, m: Messages) {
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
function titleOf(c: Exclude<Confirmation, { kind: "delete" }>, m: Messages) {
  if (c.kind === "status") return c.status === "ACTIVE" ? m.titles.suspend : m.titles.activate;
  if (c.kind === "joinCode") return c.required ? m.titles.codeOff : m.titles.codeOn;
  if (c.kind === "services")
    return c.from.dineIn !== c.to.dineIn
      ? c.to.dineIn
        ? m.titles.dineInOn
        : m.titles.dineInOff
      : c.to.online
        ? m.titles.onlineOn
        : m.titles.onlineOff;
  if (c.kind === "slug") return c.from ? m.titles.slugChange : m.titles.slugSet;
  return m.accountTitle(
    c.account.role,
    c.kind === "reset" ? "reset" : c.account.isActive ? "disable" : "enable",
  );
}

function RestaurantView({ identity, id }: { identity: PlatformIdentity; id: string }) {
  const language = useStaffLanguage();
  const m = platformMessages[language];
  const client = useQueryClient();
  // The name of the restaurant this page deleted; the page stops reading it from then on.
  const [deleted, setDeleted] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["platform", "restaurant", identity.userId, id],
    queryFn: ({ signal }) => readRestaurant(id, signal),
    enabled: deleted === null,
  });
  const subscriptionKey = platformSubscriptionKey(identity.userId, id);
  const subscriptionFetching = useIsFetching({ queryKey: subscriptionKey }) > 0;
  const actions = useManagement("platform", identity.userId);
  // The confirmation outlives its dialog, so the closing dialog keeps its text.
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The card that asked for the open confirmation; it becomes the result's place once confirmed,
  // so a cancelled dialog never moves an earlier result.
  const [askedFrom, setAskedFrom] = useState<Origin>(null);
  const [origin, setOrigin] = useState<Origin>(null);
  // Typing the name guards against deleting the wrong restaurant; it lives only in this state.
  const [typedName, setTypedName] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  // One inline editor at a time, opened inside the row it changes.
  const [editing, setEditing] = useState<"map" | "theme" | "slug" | null>(null);
  const [slugError, setSlugError] = useState("");
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
  // A background refresh leaves the controls usable; a confirmation still waits for it to finish.
  const writeLocked =
    actions.busy || !!actions.pending || actions.damaged || query.isError || !query.data;
  const confirmLocked = writeLocked || query.isFetching;
  const ask = (c: Confirmation, from: Origin) => {
    if (writeLocked) return;
    setAskedFrom(from);
    setTypedName("");
    setConfirmation(c);
    setConfirming(true);
  };
  const closeConfirmation = () => {
    setConfirming(false);
    setTypedName("");
  };
  const submit = async () => {
    if (
      !confirming ||
      !confirmation ||
      confirmLocked ||
      changed ||
      (confirmation.kind === "delete" && !nameConfirmed)
    )
      return;
    const c = confirmation;
    const name = query.data!.restaurant.name;
    closeConfirmation();
    setOrigin(askedFrom);
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
      if (
        await actions.run({ kind: "slug", restaurantId: id }, (signal) => setSlug(id, c.to, signal))
      )
        setEditing(null);
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
  // Neither money nor irreversible: the link saves without a confirmation, and a blank value clears it.
  const saveMap = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (writeLocked) return;
    const value = String(new FormData(event.currentTarget).get("googleMapsUrl") ?? "").trim();
    setOrigin("appearance");
    const saved = await actions.run({ kind: "maps", restaurantId: id }, (signal) =>
      setGoogleMapsUrl(id, value || null, signal),
    );
    if (saved) setEditing(null);
  };
  // The link changes what customers can reach, so it goes through the confirmation; the editor
  // stays open until the change is saved.
  const proposeSlug = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const restaurant = query.data?.restaurant;
    const value = String(new FormData(event.currentTarget).get("slug") ?? "").trim();
    if (writeLocked || !restaurant) return;
    if (!isSlug(value)) {
      setSlugError(m.slugInvalid);
      return;
    }
    setSlugError("");
    if (value === restaurant.slug) setEditing(null);
    else ask({ kind: "slug", from: restaurant.slug, to: value }, "features");
  };
  // Colours only, so no confirmation either; the next page load or poll applies it.
  const saveTheme = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const theme = new FormData(event.currentTarget).get("theme");
    if (writeLocked || !isTheme(theme)) return;
    setOrigin("appearance");
    const saved = await actions.run({ kind: "theme", restaurantId: id }, (signal) =>
      setTheme(id, theme, signal),
    );
    if (saved) setEditing(null);
  };
  const refresh = () => {
    void query.refetch();
    void client.invalidateQueries({ queryKey: subscriptionKey });
  };
  const feedback = (where: Origin, className = "mt-3") =>
    origin === where && actions.message ? (
      <Notice className={className}>{actions.message}</Notice>
    ) : null;
  if (deleted !== null)
    return (
      <>
        <PageHeader
          title={deleted}
          back={{ to: "/platform/restaurants", search: listSearch(), label: m.backToList }}
        />
        <Notice tone="success">{m.deleted(deleted)}</Notice>
      </>
    );
  const restaurant = query.data?.restaurant;
  const accounts = query.data?.accounts ?? [];
  const services = restaurant?.services;
  const controlsLocked = writeLocked || confirming;
  return (
    <>
      <PageHeader
        title={restaurant?.name ?? m.detailTitle}
        back={{ to: "/platform/restaurants", search: listSearch(), label: m.backToList }}
        actions={
          <Button variant="outline" size="icon" aria-label={m.refreshRestaurant} onClick={refresh}>
            <RefreshCw
              className={cn((query.isFetching || subscriptionFetching) && "animate-spin")}
            />
          </Button>
        }
      />
      {query.isPending && <LoadingState label={m.loading} />}
      {query.error && (
        <Notice tone="error" className="mb-4">
          {errorMessage(query.error, undefined, language)}
        </Notice>
      )}
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
      {feedback(null, "mb-4")}
      {restaurant && services && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={restaurant.serviceStatus === "ACTIVE" ? "success" : "outline"}>
              {restaurant.serviceStatus === "ACTIVE" ? m.serviceOn : m.serviceOff}
            </Badge>
            {services.dineIn && <Badge variant="secondary">{m.serviceDineIn}</Badge>}
            {services.online && <Badge variant="secondary">{m.serviceOnline}</Badge>}
          </div>
          {restaurant.serviceStatus === "SUSPENDED" && (
            <Notice
              tone="warning"
              action={
                <Button
                  disabled={controlsLocked}
                  onClick={() => ask({ kind: "status", status: "SUSPENDED" }, null)}
                >
                  {m.activateService}
                </Button>
              }
            >
              {m.suspendedNotice}
            </Notice>
          )}
          <PlatformSubscription userId={identity.userId} restaurantId={id} />
          <Section title={m.services} description={m.servicesRule}>
            <div className="divide-y">
              <div>
                <SettingRow
                  labelId="feature-dine-in"
                  label={m.serviceDineIn}
                  value={m.serviceDineInHint}
                >
                  <Switch
                    aria-labelledby="feature-dine-in"
                    checked={services.dineIn}
                    disabled={controlsLocked || (services.dineIn && !services.online)}
                    onCheckedChange={() =>
                      ask(
                        {
                          kind: "services",
                          from: services,
                          to: { ...services, dineIn: !services.dineIn },
                        },
                        "features",
                      )
                    }
                  />
                </SettingRow>
                {services.dineIn && (
                  <>
                    <SettingRow
                      nested
                      labelId="feature-join-code"
                      label={m.joinCode}
                      value={restaurant.joinCodeRequired ? m.codeRequired : m.codeNotRequired}
                    >
                      <Switch
                        aria-labelledby="feature-join-code"
                        checked={restaurant.joinCodeRequired}
                        disabled={controlsLocked}
                        onCheckedChange={() =>
                          ask(
                            { kind: "joinCode", required: restaurant.joinCodeRequired },
                            "features",
                          )
                        }
                      />
                    </SettingRow>
                    <SettingRow
                      nested
                      label={m.ordering}
                      value={m.orderingValue(restaurant.orderingEnabled)}
                    />
                  </>
                )}
              </div>
              <div>
                <SettingRow
                  labelId="feature-online"
                  label={m.serviceOnline}
                  value={
                    !services.online && !restaurant.slug ? m.servicesNeedSlug : m.serviceOnlineHint
                  }
                >
                  <Switch
                    aria-labelledby="feature-online"
                    checked={services.online}
                    disabled={
                      controlsLocked ||
                      (!services.online && !restaurant.slug) ||
                      (services.online && !services.dineIn)
                    }
                    onCheckedChange={() =>
                      ask(
                        {
                          kind: "services",
                          from: services,
                          to: { ...services, online: !services.online },
                        },
                        "features",
                      )
                    }
                  />
                </SettingRow>
                <SettingRow
                  nested
                  label={m.onlineLink}
                  value={restaurant.slug ? `/r/${restaurant.slug}` : m.notSet}
                >
                  {editing !== "slug" && (
                    <Button
                      variant="outline"
                      disabled={controlsLocked}
                      onClick={() => {
                        setSlugError("");
                        setEditing("slug");
                      }}
                    >
                      {restaurant.slug ? m.edit : m.set}
                    </Button>
                  )}
                </SettingRow>
                {editing === "slug" && (
                  <form
                    onSubmit={proposeSlug}
                    className="ml-1 space-y-3 border-l-2 pb-3 pl-4"
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
                      <Button type="submit" disabled={controlsLocked}>
                        {m.checkContinue}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                        {m.cancel}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
            {feedback("features")}
          </Section>
          <Section title={m.appearance}>
            <div className="divide-y">
              <div>
                <SettingRow label={m.theme} value={<ThemeName theme={restaurant.theme} />}>
                  {editing !== "theme" && (
                    <Button
                      variant="outline"
                      disabled={controlsLocked}
                      onClick={() => setEditing("theme")}
                    >
                      {m.edit}
                    </Button>
                  )}
                </SettingRow>
                {editing === "theme" && (
                  <form onSubmit={saveTheme} className="space-y-3 pb-3" aria-label={m.themeForm}>
                    <ThemeChoices name="theme" defaultValue={restaurant.theme} />
                    <p className="text-sm text-muted-foreground">{m.themeHint}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={controlsLocked}>
                        {m.saveTheme}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                        {m.cancel}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
              <div>
                <SettingRow
                  label={m.map}
                  value={
                    restaurant.googleMapsUrl ? (
                      <a
                        href={restaurant.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={m.openMap(restaurant.name)}
                        className="inline-flex min-h-11 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {m.mapOpen}
                        <ExternalLink aria-hidden="true" className="size-3.5" />
                      </a>
                    ) : (
                      m.noMap
                    )
                  }
                >
                  {editing !== "map" && (
                    <Button
                      variant="outline"
                      disabled={controlsLocked}
                      onClick={() => setEditing("map")}
                    >
                      {restaurant.googleMapsUrl ? m.edit : m.add}
                    </Button>
                  )}
                </SettingRow>
                {editing === "map" && (
                  <form onSubmit={saveMap} className="space-y-3 pb-3" aria-label={m.editMapForm}>
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
                      <Button type="submit" disabled={controlsLocked}>
                        {m.saveMap}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                        {m.cancel}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
              <SettingRow
                label={m.menuLanguage}
                value={LANGUAGE_NAMES[restaurant.defaultLanguage]}
              />
            </div>
            {feedback("appearance")}
          </Section>
          <Section title={m.accounts}>
            <div className="divide-y">
              {accounts.map((a) => (
                <div key={a.id} className="py-3">
                  <AccountRow
                    account={a}
                    platform
                    disabled={controlsLocked}
                    choose={(kind, account) => ask({ kind, account }, "accounts")}
                  />
                </div>
              ))}
            </div>
            <TemporaryPasswords credentials={actions.secrets} close={actions.clearSecrets} />
            {feedback("accounts")}
          </Section>
          <Section title={m.danger} className="ring-destructive/40">
            <div className="divide-y">
              {restaurant.serviceStatus === "ACTIVE" && (
                <SettingRow label={m.suspendService} value={m.suspendHint}>
                  <Button
                    variant="outline"
                    disabled={controlsLocked}
                    onClick={() => ask({ kind: "status", status: "ACTIVE" }, "danger")}
                  >
                    {m.suspendService}
                  </Button>
                </SettingRow>
              )}
              <SettingRow
                label={m.deleteSection}
                value={restaurant.serviceStatus === "SUSPENDED" ? m.deleteReady : m.deleteBlocked}
              >
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={controlsLocked || restaurant.serviceStatus !== "SUSPENDED"}
                  onClick={() => ask({ kind: "delete" }, "danger")}
                >
                  <Trash2 />
                  {m.deleteForever}
                </Button>
              </SettingRow>
            </div>
            {feedback("danger")}
          </Section>
          <ConfirmDialog
            open={confirming && !!confirmation}
            title={
              confirmation?.kind === "delete"
                ? m.deleteTitle(restaurant.name)
                : confirmation
                  ? `${titleOf(confirmation, m)} · ${restaurant.name}`
                  : ""
            }
            description={
              confirmation && confirmation.kind !== "delete" ? describe(confirmation, m) : undefined
            }
            confirmLabel={confirmation?.kind === "delete" ? m.deleteForever : m.confirm}
            cancelLabel={m.cancel}
            tone={confirmation?.kind === "delete" ? "destructive" : "default"}
            confirmDisabled={
              confirmLocked || changed || (confirmation?.kind === "delete" && !nameConfirmed)
            }
            initialFocus={confirmation?.kind === "delete" ? nameInput : undefined}
            onConfirm={() => void submit()}
            onCancel={closeConfirmation}
          >
            {confirmation?.kind === "delete" && (
              <div className="space-y-4">
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
                  {m.deleteConsequences.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <Label htmlFor="delete-restaurant-name">{m.typeName(restaurant.name)}</Label>
                  <Input
                    ref={nameInput}
                    id="delete-restaurant-name"
                    value={typedName}
                    onChange={(event) => setTypedName(event.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
            )}
            {changed && <Notice tone="error">{m.stateChanged}</Notice>}
          </ConfirmDialog>
        </div>
      )}
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
