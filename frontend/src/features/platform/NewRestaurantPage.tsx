import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PeriodFields } from "@/features/subscriptions/PeriodFields";
import { platformSubscriptionMessages } from "@/features/subscriptions/messages";
import {
  addCalendarMonths,
  periodTotal,
  periodFromForm,
  type PeriodInput,
} from "@/features/subscriptions/state";
import { formatCalendarDate, formatMoney, parsePrice, RESTAURANT_TIME_ZONE } from "@/lib/format";
import { randomUuid } from "@/lib/ids";
import { LANGUAGE_NAMES, LANGUAGES } from "@/lib/language";
import { DEFAULT_THEME, isTheme } from "@/lib/theme";
import { useLiveView } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { createRestaurant, type CreateRestaurantInput } from "./api";
import type { PlatformIdentity } from "./identity";
import { TemporaryPasswords, ThemeChoices } from "./ManagementViews";
import { platformMessages } from "./messages";
import { PlatformBoundary } from "./PlatformAuth";
import { isSlug, servicesValid, type RestaurantServices } from "./state";
import { listSearch } from "./list-search";
import { useManagement } from "./useManagement";

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t pt-5 first:border-t-0 first:pt-0 sm:grid-cols-2">
      <legend className="float-left mb-1 w-full text-base font-semibold sm:col-span-2">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function NewRestaurant({
  account,
  createAnother,
}: {
  account: PlatformIdentity;
  createAnother: () => void;
}) {
  const language = useStaffLanguage();
  const m = platformMessages[language];
  const s = platformSubscriptionMessages[language];
  const [monthlyInput, setMonthlyInput] = useState("");
  const [includePeriod, setIncludePeriod] = useState(false);
  const [requireCode, setRequireCode] = useState(true);
  const [services, setServices] = useState<RestaurantServices>({ dineIn: true, online: false });
  const [createError, setCreateError] = useState("");
  // A creation with a first period waits for the confirmation; nothing is sent before it.
  const [proposal, setProposal] = useState<{
    input: CreateRestaurantInput;
    period: PeriodInput;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Results of a submission from this page show next to its button; recovered ones at the top.
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const live = useLiveView();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: RESTAURANT_TIME_ZONE }).format(
    new Date(live.now),
  );
  const actions = useManagement("platform", account.userId);
  const locked = actions.busy || actions.damaged || (!!actions.pending && !actions.missingCreate);
  const send = async (input: CreateRestaurantInput) => {
    setSubmitted(true);
    const ok = await actions.run({ kind: "create", restaurantId: input.id }, (signal) =>
      createRestaurant(input, signal),
    );
    if (ok) setCreated({ id: input.id, name: input.name });
  };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked) return;
    const data = new FormData(event.currentTarget);
    // A lost create is retried with its original ID, so the server can recognise it.
    const id = actions.pending?.kind === "create" ? actions.pending.restaurantId : randomUuid();
    const defaultMonthlyFeeCents = monthlyInput.trim() ? parsePrice(monthlyInput) : null;
    if (monthlyInput.trim() && defaultMonthlyFeeCents === null) {
      setCreateError(s.monthlyInvalid);
      return;
    }
    let initialPeriod: PeriodInput | null = null;
    try {
      if (includePeriod) initialPeriod = periodFromForm(data, "create-period", randomUuid());
    } catch {
      setCreateError(s.periodInvalid);
      return;
    }
    const slug = services.online ? String(data.get("slug") ?? "").trim() || null : null;
    if (slug !== null && !isSlug(slug)) {
      setCreateError(m.slugInvalid);
      return;
    }
    if (!servicesValid(services, slug)) {
      setCreateError(m.servicesInvalid);
      return;
    }
    setCreateError("");
    const theme = data.get("theme");
    const input: CreateRestaurantInput = {
      id,
      name: String(data.get("name")),
      defaultLanguage: String(data.get("language")),
      ownerUsername: String(data.get("owner")),
      staffUsername: String(data.get("staff")),
      ownerContact: String(data.get("ownerContact") ?? "").trim() || null,
      googleMapsUrl: String(data.get("googleMapsUrl") ?? "").trim() || null,
      defaultMonthlyFeeCents,
      initialPeriod,
      joinCodeRequired: services.dineIn ? requireCode : true,
      theme: isTheme(theme) ? theme : DEFAULT_THEME,
      services,
      slug,
    };
    if (initialPeriod) {
      setProposal({ input, period: initialPeriod });
      setConfirming(true);
    } else await send(input);
  };
  const confirmPeriod = async () => {
    if (!confirming || !proposal || locked) return;
    setConfirming(false);
    await send(proposal.input);
  };
  const header = (
    <PageHeader
      title={m.createTitle}
      description={created ? undefined : m.createHint}
      back={{ to: "/platform/restaurants", search: listSearch(), label: m.backToList }}
    />
  );
  if (created)
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <div className="space-y-4">
          <Notice tone="success">{m.created(created.name)}</Notice>
          <TemporaryPasswords credentials={actions.secrets} close={actions.clearSecrets} />
          <div className="flex flex-wrap gap-2">
            <Link
              to="/platform/restaurants/$restaurantId"
              params={{ restaurantId: created.id }}
              className={buttonVariants()}
            >
              {m.openRestaurant}
            </Link>
            <Button variant="outline" onClick={createAnother}>
              {m.createAnother}
            </Button>
          </div>
        </div>
      </div>
    );
  const period = proposal?.period;
  return (
    <div className="mx-auto max-w-2xl">
      {header}
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
      {!submitted && actions.message && <Notice className="mb-4">{actions.message}</Notice>}
      <form
        onSubmit={create}
        className="rounded-2xl bg-card p-4 shadow-xs ring-1 ring-foreground/10 sm:p-5"
      >
        <fieldset disabled={locked} className="space-y-5">
          <Group legend={m.basics}>
            <div className="space-y-2">
              <Label htmlFor="create-name">{m.name}</Label>
              <Input id="create-name" name="name" required maxLength={150} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-language">{m.menuLanguage}</Label>
              <NativeSelect
                id="create-language"
                name="language"
                defaultValue="zh"
                className="w-full"
              >
                {LANGUAGES.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {LANGUAGE_NAMES[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </Group>
          <Group legend={m.accounts}>
            {(
              [
                ["owner", m.ownerUsername],
                ["staff", m.staffUsername],
              ] as const
            ).map(([name, label]) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={`create-${name}`}>{label}</Label>
                <Input
                  id={`create-${name}`}
                  name={name}
                  required
                  maxLength={50}
                  autoComplete="off"
                />
              </div>
            ))}
          </Group>
          <Group legend={m.services}>
            <div className="space-y-1 sm:col-span-2">
              {(
                [
                  ["dineIn", m.serviceDineIn, m.serviceDineInHint],
                  ["online", m.serviceOnline, m.serviceOnlineHint],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    checked={services[key]}
                    onCheckedChange={(checked) =>
                      setServices((current) => ({ ...current, [key]: checked }))
                    }
                  />
                  <span>
                    {label}
                    <span className="block text-sm text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {services.online && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="create-slug">{m.slugField}</Label>
                <Input
                  id="create-slug"
                  name="slug"
                  required
                  maxLength={40}
                  pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="create-slug-hint"
                />
                <p id="create-slug-hint" className="text-sm text-muted-foreground">
                  {m.slugHint}
                </p>
              </div>
            )}
            {services.dineIn && (
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
            )}
          </Group>
          <div className="border-t pt-5">
            <ThemeChoices name="theme" defaultValue={DEFAULT_THEME} />
          </div>
          <Group legend={m.billingLegend}>
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
              <Label htmlFor="create-monthly">{m.monthlyFee}</Label>
              <Input
                id="create-monthly"
                inputMode="decimal"
                value={monthlyInput}
                onChange={(event) => setMonthlyInput(event.target.value)}
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
                monthlyFee={parsePrice(monthlyInput)}
                startsOn={today}
                today={today}
              />
            )}
          </Group>
          <div className="space-y-3 border-t pt-5">
            {createError && <Notice tone="error">{createError}</Notice>}
            {submitted && actions.message && <Notice>{actions.message}</Notice>}
            <Button size="lg" className="w-full" type="submit">
              {actions.missingCreate ? m.createAgain : m.create}
            </Button>
          </div>
        </fieldset>
      </form>
      <ConfirmDialog
        open={confirming && !!proposal}
        title={m.initialPeriodTitle}
        description={
          period &&
          s.periodConfirm(
            true,
            formatCalendarDate(period.startsOn, language),
            formatCalendarDate(addCalendarMonths(period.startsOn, period.months)!, language),
            period.months,
            formatMoney(periodTotal(period.monthlyFeeCents, period.months)!, language),
            period.paidOn ? formatCalendarDate(period.paidOn, language) : null,
          )
        }
        confirmLabel={m.create}
        cancelLabel={m.cancel}
        confirmDisabled={locked}
        onConfirm={() => void confirmPeriod()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

export function NewRestaurantPage() {
  // Creating another restaurant starts from a fresh page, without the previous result.
  const [round, setRound] = useState(0);
  return (
    <PlatformBoundary>
      {(account) => (
        <NewRestaurant
          key={`${account!.userId}:${round}`}
          account={account!}
          createAnother={() => setRound((value) => value + 1)}
        />
      )}
    </PlatformBoundary>
  );
}
