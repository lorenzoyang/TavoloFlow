import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, Plus, RefreshCw, X } from "lucide-react";
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
import { isSameAccount, refreshAfterWrite } from "@/features/accounts/queries";
import { ServiceNotOffered } from "@/features/accounts/ServiceNotOffered";
import { qrPng } from "@/features/tables/qr-image";
import { isLocalOnlyUrl, publicMenuUrl } from "@/features/tables/qr-url";
import { errorMessage } from "@/lib/api";
import { formatTime, formatWeekdayTime } from "@/lib/format";
import type { Language } from "@/lib/language";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import {
  onlinePath,
  onlineSettingsQuery,
  pauseOnline,
  resumeOnline,
  saveOnlineHours,
  savePublicPhone,
  type OnlineSettings,
} from "./api";
import { onlineMessages } from "./messages";
import { normalizePhone, sameHours, WEEKDAYS, weekDraft, weekHours, type WeekDraft } from "./state";

type Messages = (typeof onlineMessages)[Language];

function StatusCard({
  settings,
  owner,
  busy,
  send,
}: {
  settings: OnlineSettings;
  owner: boolean;
  busy: boolean;
  send: (request: () => Promise<unknown>) => void;
}) {
  const language = useStaffLanguage();
  const m = onlineMessages[language];
  const open = settings.status === "OPEN";
  const label = {
    OPEN: m.open,
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
      ? m.openHint(formatTime(settings.currentSlotEndsAt, language))
      : settings.status === "PAUSED" && settings.pausedUntil
        ? m.pausedHint(formatWeekdayTime(settings.pausedUntil, language))
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
                onClick={() => send(() => pauseOnline("SLOT"))}
              >
                {settings.currentSlotEndsAt
                  ? m.pauseSlot(formatTime(settings.currentSlotEndsAt, language))
                  : m.pauseSlotUnavailable}
              </Button>
              <p className="text-sm text-muted-foreground">{m.pauseSlotHint}</p>
            </div>
            <div className="space-y-1">
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => send(() => pauseOnline("TODAY"))}
              >
                {m.pauseToday}
              </Button>
              <p className="text-sm text-muted-foreground">{m.pauseTodayHint}</p>
            </div>
          </div>
        )}
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

function PhoneCard({
  settings,
  busy,
  send,
}: {
  settings: OnlineSettings;
  busy: boolean;
  send: (request: () => Promise<unknown>, done?: () => void) => void;
}) {
  const m = onlineMessages[useStaffLanguage()];
  // The local edit survives background refreshes until it is saved or discarded.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const value = draft ?? settings.publicPhone ?? "";
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const blank = value.trim() === "";
    const phone = blank ? null : normalizePhone(value);
    if (!blank && phone === null) {
      setError(m.phoneInvalid);
      return;
    }
    setError("");
    send(
      () => savePublicPhone(phone),
      () => setDraft(null),
    );
  }
  return (
    <Card>
      <CardContent>
        <form className="space-y-4" onSubmit={save} noValidate>
          <div className="space-y-1">
            <h2 className="font-semibold">{m.phoneTitle}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{m.phoneHint}</p>
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
              aria-invalid={!!error}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={busy || draft === null}>
            {m.savePhone}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function HoursCard({
  settings,
  busy,
  send,
}: {
  settings: OnlineSettings;
  busy: boolean;
  send: (request: () => Promise<unknown>, done?: () => void) => void;
}) {
  const m = onlineMessages[useStaffLanguage()];
  const [draft, setDraft] = useState<WeekDraft | null>(null);
  const [error, setError] = useState("");
  const week = draft ?? weekDraft(settings.hours);
  const parsed = weekHours(week);
  const unchanged = draft === null || (parsed.ok && sameHours(parsed.hours, settings.hours));
  const edit = (weekday: number, slots: WeekDraft[number]) => {
    setError("");
    setDraft({ ...week, [weekday]: slots });
  };
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed.ok) {
      setError(m.weekProblem(m.weekdays[parsed.weekday - 1], parsed.problem));
      return;
    }
    setError("");
    send(
      () => saveOnlineHours(parsed.hours),
      () => setDraft(null),
    );
  }
  return (
    <Card>
      <CardContent>
        <form className="space-y-4" onSubmit={save} noValidate>
          <div className="space-y-1">
            <h2 className="font-semibold">{m.hoursTitle}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{m.hoursHint}</p>
          </div>
          <div className="divide-y">
            {WEEKDAYS.map((weekday) => {
              const day = m.weekdays[weekday - 1];
              const slots = week[weekday];
              return (
                <fieldset key={weekday} className="space-y-2 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <legend className="font-medium">{day}</legend>
                    {slots.length === 0 && (
                      <span className="text-sm text-muted-foreground">{m.closedDay}</span>
                    )}
                  </div>
                  {slots.map((slot, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label htmlFor={`opens-${weekday}-${index}`} className="text-xs">
                          {m.opens}
                        </Label>
                        <Input
                          id={`opens-${weekday}-${index}`}
                          type="time"
                          value={slot.opens}
                          onChange={(event) =>
                            edit(
                              weekday,
                              slots.map((s, i) =>
                                i === index ? { ...s, opens: event.target.value } : s,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label htmlFor={`closes-${weekday}-${index}`} className="text-xs">
                          {m.closes}
                        </Label>
                        <Input
                          id={`closes-${weekday}-${index}`}
                          type="time"
                          value={slot.closes}
                          onChange={(event) =>
                            edit(
                              weekday,
                              slots.map((s, i) =>
                                i === index ? { ...s, closes: event.target.value } : s,
                              ),
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={m.removeSlot(day, index + 1)}
                        onClick={() =>
                          edit(
                            weekday,
                            slots.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  {slots.length < 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        edit(weekday, [
                          ...slots,
                          slots.length === 0
                            ? { opens: "12:00", closes: "14:30" }
                            : { opens: "19:00", closes: "22:00" },
                        ])
                      }
                    >
                      <Plus />
                      {m.addSlot}
                    </Button>
                  )}
                </fieldset>
              );
            })}
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || unchanged}>
              {m.saveHours}
            </Button>
            {draft !== null && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                {m.resetHours}
              </Button>
            )}
          </div>
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
  const [notice, setNotice] = useState("");
  // Each write sends its target and returns the fresh settings; the page rereads them afterwards.
  const mutation = useMutation({
    mutationFn: ({ request }: { request: () => Promise<unknown>; done?: () => void }) => request(),
    onMutate: () => setNotice(""),
    onSuccess: async (_, { done }) => {
      if (!isSameAccount(client, account)) return;
      done?.();
      const result = await refreshAfterWrite(client, account, options);
      if (result === "refreshed") setNotice(m.saved);
      else if (result === "failed") setNotice(m.refreshFailed);
    },
  });
  const send = (request: () => Promise<unknown>, done?: () => void) =>
    mutation.mutate({ request, done });
  const busy = mutation.isPending;
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
      <div className="mb-4 space-y-3">
        {notice && <Notice tone="success">{notice}</Notice>}
        {(query.isError || query.fetchStatus === "paused") && (
          <Notice tone="error">{m.readError}</Notice>
        )}
        {mutation.isError && (
          <Notice tone="error">{errorMessage(mutation.error, m.unknownResult, language)}</Notice>
        )}
      </div>
      {!settings ? (
        query.isPending && <LoadingState label={m.loading} />
      ) : (
        <div className="space-y-4">
          <StatusCard settings={settings} owner={owner} busy={busy} send={send} />
          <LinkCard slug={settings.slug} />
          {owner && <PhoneCard settings={settings} busy={busy} send={send} />}
          {owner && <HoursCard settings={settings} busy={busy} send={send} />}
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
