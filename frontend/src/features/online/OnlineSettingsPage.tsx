import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, RefreshCw } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import { ServiceNotOffered } from "@/features/accounts/ServiceNotOffered";
import { qrPng } from "@/features/tables/qr-image";
import { isLocalOnlyUrl, publicMenuUrl } from "@/features/tables/qr-url";
import { errorMessage, withTimeout } from "@/lib/api";
import { formatClosingTime, formatWeekdayClosingTime, formatWeekdayTime } from "@/lib/format";
import { type Language } from "@/lib/language";
import { staffMessages } from "@/lib/staff-messages";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import {
  onlinePath,
  onlineSettingsQuery,
  pauseOnline,
  resumeOnline,
  savePublicPhone,
  type OnlineSettings,
} from "./api";
import { onlineMessages } from "./messages";
import { normalizePhone } from "./state";
import type { SettingsWrite, SendSettings, SettingsCardProps } from "./settings-card";
import { HoursSettingsCard } from "./HoursSettingsCard";
import { PickupSettingsCard } from "./PickupSettingsCard";
import { DeliverySettingsCard } from "./DeliverySettingsCard";
import { CouponsSettingsCard } from "./CouponsSettingsCard";

type Messages = (typeof onlineMessages)[Language];
// The card a write came from: its saved or failed result shows there, beside the button that sent it.
// A saved result disappears once the card is edited again, so it never stands beside unsaved changes;
// a failure stays until the next attempt.
type SettingsCard = "status" | "phone" | "hours" | "pickup" | "delivery" | "coupons";

function StatusCard({
  settings,
  owner,
  busy,
  send,
  feedback,
}: {
  settings: OnlineSettings;
  owner: boolean;
  busy: boolean;
  send: SendSettings;
  feedback: ReactNode;
}) {
  const language = useStaffLanguage();
  const m = onlineMessages[language];
  const open = settings.status === "OPEN";
  const label = {
    OPEN: m.open,
    BUSY: m.busy,
    PAUSED: m.paused,
    CLOSED_HOURS: m.closedHours,
    NOT_OFFERED: m.notOffered,
    SUSPENDED: m.suspended,
  }[settings.status];
  const missing = [
    !settings.publicPhone && m.missingPhone,
    settings.hours.length === 0 && m.missingHours,
  ].filter((text): text is string => !!text);
  // A missing phone or week is the reason the service is closed; the warning below says so once.
  const explained =
    missing.length > 0 && (settings.status === "NOT_OFFERED" || settings.status === "CLOSED_HOURS");
  const hint = explained
    ? null
    : settings.status === "OPEN" && settings.currentSlotEndsAt
      ? m.openHint(formatClosingTime(settings.currentSlotEndsAt, language))
      : settings.status === "BUSY"
        ? m.busyHint
        : settings.status === "PAUSED" && settings.pausedUntil
          ? m.pausedHint(formatWeekdayClosingTime(settings.pausedUntil, language))
          : settings.status === "CLOSED_HOURS" && settings.nextOpensAt
            ? m.closedHint(formatWeekdayTime(settings.nextOpensAt, language))
            : settings.status === "NOT_OFFERED"
              ? m.notOfferedHint
              : m.suspendedHint;
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{m.statusTitle}</h2>
          <Badge variant={open ? "success" : "outline"} className="whitespace-nowrap">
            {label}
          </Badge>
        </div>
        {hint && <p className="text-sm leading-6">{hint}</p>}
        {missing.length > 0 && settings.status !== "SUSPENDED" && (
          <Notice tone="warning">
            {m.notTaking(missing)} {owner ? m.ownerFixes : ""}
          </Notice>
        )}
        {settings.pausedUntil ? (
          <Button disabled={busy} onClick={() => send(resumeOnline)}>
            {m.resume}
          </Button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Button
                variant="outline"
                className="w-full"
                disabled={busy || !settings.currentSlotEndsAt}
                onClick={() => send((signal) => pauseOnline("SLOT", signal))}
              >
                {settings.currentSlotEndsAt
                  ? m.pauseSlot(formatClosingTime(settings.currentSlotEndsAt, language))
                  : m.pauseSlotUnavailable}
              </Button>
              <p className="text-sm text-muted-foreground">{m.pauseSlotHint}</p>
            </div>
            <div className="space-y-1">
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => send((signal) => pauseOnline("TODAY", signal))}
              >
                {m.pauseToday}
              </Button>
              <p className="text-sm text-muted-foreground">{m.pauseTodayHint}</p>
            </div>
          </div>
        )}
        {feedback}
      </CardContent>
    </Card>
  );
}

// The link customers open and its QR code, generated in the browser like the table QR codes.
function LinkCard({ slug }: { slug: string | null }) {
  const m = onlineMessages[useStaffLanguage()];
  let url = "";
  let configurationDetail = "";
  if (slug)
    try {
      url = publicMenuUrl(
        onlinePath(slug),
        window.location.origin,
        import.meta.env.VITE_PUBLIC_BASE_URL,
      );
    } catch (error) {
      configurationDetail = error instanceof Error ? error.message : String(error);
    }
  // The page shows a translated notice; whoever configures the deployment finds the reason here.
  useEffect(() => {
    if (configurationDetail) console.error(configurationDetail);
  }, [configurationDetail]);
  const [image, setImage] = useState<{ url: string; data?: string; failed?: boolean }>();
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void qrPng(url)
      .then((data) => {
        if (!cancelled) setImage({ url, data });
      })
      .catch(() => {
        if (!cancelled) setImage({ url, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  const current = image?.url === url ? image : undefined;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice(m.copied);
    } catch {
      setNotice(m.copyFailed);
    }
  }
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-semibold">{m.linkTitle}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{m.linkHint}</p>
        </div>
        {!slug ? (
          <Notice tone="warning">{m.noLink}</Notice>
        ) : configurationDetail ? (
          <Notice tone="error">{m.configError}</Notice>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="online-link">{m.link}</Label>
              <Input
                id="online-link"
                value={url}
                readOnly
                onFocus={(event) => event.target.select()}
              />
            </div>
            {isLocalOnlyUrl(url) && <Notice tone="warning">{m.localOnly}</Notice>}
            {current?.failed ? (
              <Notice tone="error">{m.qrFailed}</Notice>
            ) : current?.data ? (
              <img
                src={current.data}
                width={256}
                height={256}
                alt={m.qrAlt}
                className="mx-auto w-full max-w-52 rounded-xl border"
              />
            ) : (
              <LoadingState label={m.generating} />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => void copy()}>
                <Copy />
                {m.copy}
              </Button>
              <a
                className={buttonVariants({ variant: "outline" })}
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink />
                {m.openLink}
              </a>
              {current?.data && (
                <a
                  className={cn(buttonVariants({ variant: "outline" }), "col-span-2")}
                  href={current.data}
                  download={`tavoloflow-online-${slug}.png`}
                >
                  <Download />
                  {m.downloadQr}
                </a>
              )}
            </div>
            {notice && <Notice>{notice}</Notice>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PhoneCard({ settings, busy, send, feedback, edited }: SettingsCardProps) {
  const m = onlineMessages[useStaffLanguage()];
  // The local edit survives background refreshes until it is saved or discarded.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const value = draft ?? settings.publicPhone ?? "";
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const blank = value.trim() === "";
    const phone = blank ? null : normalizePhone(value);
    if (!blank && phone === null) {
      setError(m.phoneInvalid);
      return;
    }
    setError("");
    send(
      (signal) => savePublicPhone(phone, signal),
      () => setDraft(null),
    );
  }
  return (
    <Card>
      <CardContent>
        <form className="space-y-4" onSubmit={save} noValidate>
          <div className="space-y-1">
            <h2 className="font-semibold">{m.phoneTitle}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {m.phoneHint} <span className="block">{m.phoneCountryHint}</span>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="online-phone">{m.phone}</Label>
            <Input
              id="online-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={30}
              value={value}
              disabled={busy}
              aria-invalid={!!error}
              onChange={(event) => {
                edited();
                setDraft(event.target.value);
              }}
            />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {feedback}
          <Button type="submit" disabled={busy || draft === null}>
            {m.savePhone}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function OnlineSettingsContent({ account }: { account: CurrentAccount }) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m: Messages = onlineMessages[language];
  const c = staffMessages[language];
  const options = onlineSettingsQuery(account);
  const query = useQuery(options);
  const owner = account.role === "OWNER";
  // error null means saved.
  const [outcome, setOutcome] = useState<{ card: SettingsCard; error: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const ops = useOperations();
  useEffect(
    () =>
      onLifecycleChange(() => {
        ops.cancelAll();
        setBusy(false);
      }),
    [ops],
  );

  // Writes already return fresh settings. Keep the existing polling for later changes and unknown results.
  async function send(
    card: SettingsCard,
    request: SettingsWrite,
    done?: () => void,
    settled?: () => void,
  ) {
    if (!isLive() || !isSameAccount(client, account)) return;
    const op = ops.start("settings");
    if (!op) return;
    const current = () => op.isCurrent() && isSameAccount(client, account);
    setBusy(true);
    setOutcome(null);
    try {
      const settings = await request(withTimeout(op.signal));
      if (!current()) return;
      // A poll started before the save must not replace its response afterwards.
      await client.cancelQueries({ queryKey: options.queryKey });
      if (!current()) return;
      client.setQueryData(options.queryKey, settings);
      done?.();
      setOutcome({ card, error: null });
    } catch (e) {
      if (current()) setOutcome({ card, error: e });
    } finally {
      if (op.finish()) setBusy(false);
      settled?.();
    }
  }
  // What every card shares: the busy state, a send bound to the card, that card's result and the
  // edit signal that clears its saved result.
  const cardProps = (card: SettingsCard) => ({
    busy,
    send: ((request, done, settled) => send(card, request, done, settled)) satisfies SendSettings,
    edited: () =>
      setOutcome((current) => (current?.card === card && current.error === null ? null : current)),
    feedback:
      outcome?.card !== card ? null : outcome.error === null ? (
        <Notice tone="success">{m.saved}</Notice>
      ) : (
        <Notice tone="error">{errorMessage(outcome.error, m.unknownResult, language)}</Notice>
      ),
  });
  const settings = query.data;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={m.title}
        description={account.restaurantName}
        back={{ to: "/staff", label: c.home }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refresh}
            disabled={query.isFetching || busy}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          </Button>
        }
      />
      {(query.isError || query.fetchStatus === "paused") && (
        <Notice tone="error" className="mb-4">
          {m.readError}
        </Notice>
      )}
      {!settings ? (
        query.isPending && <LoadingState label={m.loading} />
      ) : (
        <div className="space-y-4">
          <StatusCard settings={settings} owner={owner} {...cardProps("status")} />
          <LinkCard slug={settings.slug} />
          {owner && <PhoneCard settings={settings} {...cardProps("phone")} />}
          {owner && <HoursSettingsCard settings={settings} {...cardProps("hours")} />}
          {owner && <PickupSettingsCard settings={settings} {...cardProps("pickup")} />}
          {owner && (
            <DeliverySettingsCard
              settings={settings}
              {...cardProps("delivery")}
              saved={outcome?.card === "delivery" && outcome.error === null}
            />
          )}
          {owner && <CouponsSettingsCard settings={settings} {...cardProps("coupons")} />}
        </div>
      )}
    </div>
  );
}

export function OnlineSettingsPage() {
  return (
    <AuthBoundary mode="account">
      {(account) =>
        account.services.online ? (
          <OnlineSettingsContent
            key={`${account.restaurantId}:${account.userId}`}
            account={account}
          />
        ) : (
          <ServiceNotOffered messages={onlineMessages} backToHome />
        )
      }
    </AuthBoundary>
  );
}
