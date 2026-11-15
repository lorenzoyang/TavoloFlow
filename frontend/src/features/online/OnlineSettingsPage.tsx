import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import { ServiceNotOffered } from "@/features/accounts/ServiceNotOffered";
import { qrPng } from "@/features/tables/qr-image";
import { isLocalOnlyUrl, publicMenuUrl } from "@/features/tables/qr-url";
import { errorMessage, withTimeout } from "@/lib/api";
import { formatTime, formatWeekdayTime } from "@/lib/format";
import { LANGUAGES, type Language } from "@/lib/language";
import { staffMessages } from "@/lib/staff-messages";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import {
  createCoupon,
  deleteCoupon,
  onlinePath,
  onlineSettingsQuery,
  pauseOnline,
  resumeOnline,
  saveDelivery,
  saveOnlineHours,
  savePublicPhone,
  type OnlineSettings,
} from "./api";
import { onlineMessages } from "./messages";
import {
  couponInput,
  deliveryDraft,
  deliveryInput,
  emptyCouponDraft,
  deliveryWithoutNote,
  MAX_DELIVERY_NOTE_LENGTH,
  normalizePhone,
  sameDelivery,
  sameHours,
  WEEKDAYS,
  weekDraft,
  weekHours,
  type CouponDraft,
  type CouponProblem,
  type DeliveryDraft,
  type OnlineCoupon,
  type WeekDraft,
} from "./state";

type Messages = (typeof onlineMessages)[Language];
type SettingsWrite = (signal: AbortSignal) => Promise<OnlineSettings>;
// done runs after a current success; settled after every attempt, so a dialog can close either way.
type SendSettings = (request: SettingsWrite, done?: () => void, settled?: () => void) => void;

function StatusCard({
  settings,
  owner,
  busy,
  send,
}: {
  settings: OnlineSettings;
  owner: boolean;
  busy: boolean;
  send: SendSettings;
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
      ? m.openHint(formatTime(settings.currentSlotEndsAt, language))
      : settings.status === "BUSY"
        ? m.busyHint
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
                onClick={() => send((signal) => pauseOnline("SLOT", signal))}
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
                onClick={() => send((signal) => pauseOnline("TODAY", signal))}
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
  send: SendSettings;
}) {
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
              disabled={busy}
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
  send: SendSettings;
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
    if (busy) return;
    if (!parsed.ok) {
      setError(m.weekProblem(m.weekdays[parsed.weekday - 1], parsed.problem));
      return;
    }
    setError("");
    send(
      (signal) => saveOnlineHours(parsed.hours, signal),
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
                // min-w-0: a fieldset otherwise grows to its content's minimum width, pushing the
                // time inputs and the remove button out of narrow cards.
                <fieldset key={weekday} disabled={busy} className="min-w-0 space-y-2 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <legend className="font-medium">{day}</legend>
                    {slots.length === 0 && (
                      <span className="text-sm text-muted-foreground">{m.closedDay}</span>
                    )}
                  </div>
                  {/* One line per slot; only the first shows its labels, the others keep them
                      for screen readers. */}
                  {slots.map((slot, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Label
                          htmlFor={`opens-${weekday}-${index}`}
                          className={cn("text-xs", index > 0 && "sr-only")}
                        >
                          {m.opens}
                        </Label>
                        {/* iOS gives native time inputs a minimum width unless their appearance
                            is reset, so they would overlap in a narrow row. */}
                        <Input
                          id={`opens-${weekday}-${index}`}
                          type="time"
                          className="appearance-none"
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
                      <span
                        aria-hidden="true"
                        className="flex h-11 items-center text-muted-foreground"
                      >
                        –
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Label
                          htmlFor={`closes-${weekday}-${index}`}
                          className={cn("text-xs", index > 0 && "sr-only")}
                        >
                          {m.closes}
                        </Label>
                        <Input
                          id={`closes-${weekday}-${index}`}
                          type="time"
                          className="appearance-none"
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
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                {m.discardChanges}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// OWNER: the delivery switch and the note per language, saved together like the week of hours.
function DeliveryCard({
  settings,
  busy,
  send,
}: {
  settings: OnlineSettings;
  busy: boolean;
  send: SendSettings;
}) {
  const m = onlineMessages[useStaffLanguage()];
  // The local edit survives background refreshes until it is saved or discarded.
  const [draft, setDraft] = useState<DeliveryDraft | null>(null);
  const [error, setError] = useState("");
  const value = draft ?? deliveryDraft(settings);
  const parsed = deliveryInput(value);
  const unchanged = draft === null || (parsed.ok && sameDelivery(parsed.input, settings));
  const edit = (next: DeliveryDraft) => {
    setError("");
    setDraft(next);
  };
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!parsed.ok) {
      setError(m.deliveryTooLong(m.noteLanguages[parsed.tooLong]));
      return;
    }
    setError("");
    send(
      (signal) => saveDelivery(parsed.input, signal),
      () => setDraft(null),
    );
  }
  return (
    <Card>
      <CardContent>
        <form className="space-y-4" onSubmit={save} noValidate>
          <div className="space-y-1">
            <h2 className="font-semibold">{m.deliveryTitle}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{m.deliveryHint}</p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p id="delivery-enabled" className="font-medium">
                {m.deliveryEnabled}
              </p>
              <p className="text-sm leading-5 text-muted-foreground">
                {value.enabled ? m.deliveryOn : m.deliveryOff}
              </p>
            </div>
            <Switch
              aria-labelledby="delivery-enabled"
              checked={value.enabled}
              disabled={busy}
              onCheckedChange={(enabled) => edit({ ...value, enabled })}
            />
          </div>
          {LANGUAGES.map((language) => (
            <div key={language} className="space-y-2">
              <Label htmlFor={`delivery-note-${language}`}>
                {m.deliveryNote(m.noteLanguages[language])}
              </Label>
              <Textarea
                id={`delivery-note-${language}`}
                lang={language}
                rows={3}
                maxLength={MAX_DELIVERY_NOTE_LENGTH}
                placeholder={m.deliveryPlaceholder}
                value={value.notes[language]}
                disabled={busy}
                aria-invalid={!parsed.ok && parsed.tooLong === language}
                onChange={(event) =>
                  edit({ ...value, notes: { ...value.notes, [language]: event.target.value } })
                }
              />
            </div>
          ))}
          {parsed.ok && deliveryWithoutNote(parsed.input) && (
            <Notice tone="warning">{m.deliveryNoNote}</Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || unchanged}>
              {m.saveDelivery}
            </Button>
            {draft !== null && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                {m.discardChanges}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// OWNER: coupon codes for online orders. They are created and deleted, never edited, so a create sends
// its whole target and a repeat meets COUPON_CODE_TAKEN; deleting needs a human confirmation.
function CouponsCard({
  settings,
  busy,
  send,
}: {
  settings: OnlineSettings;
  busy: boolean;
  send: SendSettings;
}) {
  const m = onlineMessages[useStaffLanguage()];
  const [draft, setDraft] = useState<CouponDraft>(emptyCouponDraft);
  const [tried, setTried] = useState(false);
  const [deleting, setDeleting] = useState<OnlineCoupon | null>(null);
  const parsed = couponInput(draft);
  const problem = (kind: CouponProblem) => tried && !parsed.ok && parsed.problems.includes(kind);
  const hint = (kind: CouponProblem) =>
    cn("text-sm", problem(kind) ? "text-destructive" : "text-muted-foreground");
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (!parsed.ok) return;
    const input = parsed.input;
    send(
      (signal) => createCoupon(input, signal),
      () => {
        setDraft(emptyCouponDraft);
        setTried(false);
      },
    );
  }
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-semibold">{m.couponsTitle}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{m.couponsHint}</p>
        </div>
        {settings.coupons.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.couponsEmpty}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {settings.coupons.map((coupon) => (
              <li key={coupon.id} className="flex items-center gap-3 py-2 pr-1 pl-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p
                    className={cn(
                      "font-mono font-semibold wrap-break-word",
                      coupon.expired && "text-muted-foreground line-through",
                    )}
                  >
                    {coupon.code}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{m.couponOff(coupon.percentOff)}</Badge>
                    {coupon.expired ? (
                      <Badge variant="outline">{m.couponExpired}</Badge>
                    ) : (
                      <span>
                        {coupon.validUntil ? m.couponUntil(coupon.validUntil) : m.couponForever}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={m.deleteCoupon(coupon.code)}
                  disabled={busy}
                  onClick={() => setDeleting(coupon)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form className="space-y-4" onSubmit={create} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="coupon-code">{m.couponCode}</Label>
              <Input
                id="coupon-code"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={20}
                value={draft.code}
                disabled={busy}
                aria-invalid={problem("code")}
                aria-describedby="coupon-code-hint"
                onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
              />
              <p id="coupon-code-hint" className={hint("code")}>
                {problem("code") ? m.couponCodeProblem : m.couponCodeHint}
              </p>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="coupon-percent">{m.couponPercent}</Label>
              <Input
                id="coupon-percent"
                inputMode="numeric"
                autoComplete="off"
                maxLength={2}
                value={draft.percent}
                disabled={busy}
                aria-invalid={problem("percent")}
                aria-describedby="coupon-percent-hint"
                onChange={(event) => setDraft({ ...draft, percent: event.target.value })}
              />
              <p id="coupon-percent-hint" className={hint("percent")}>
                {problem("percent") ? m.couponPercentProblem : m.couponPercentHint}
              </p>
            </div>
            <div className="min-w-0 space-y-2 sm:col-span-2">
              <Label htmlFor="coupon-valid-until">{m.couponValidUntil}</Label>
              <Input
                id="coupon-valid-until"
                type="date"
                value={draft.validUntil}
                disabled={busy}
                aria-describedby="coupon-valid-until-hint"
                onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })}
              />
              <p id="coupon-valid-until-hint" className="text-sm text-muted-foreground">
                {m.couponValidUntilHint}
              </p>
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            <Plus />
            {m.createCoupon}
          </Button>
        </form>
      </CardContent>
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? m.deleteCouponTitle(deleting.code) : ""}
        description={m.deleteCouponBody}
        confirmLabel={m.deleteCouponConfirm}
        tone="destructive"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          const id = deleting.id;
          send(
            (signal) => deleteCoupon(id, signal),
            undefined,
            () => setDeleting(null),
          );
        }}
      />
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
  const [error, setError] = useState<unknown>(null);
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
  async function send(request: SettingsWrite, done?: () => void, settled?: () => void) {
    if (!isLive() || !isSameAccount(client, account)) return;
    const op = ops.start("settings");
    if (!op) return;
    const current = () => op.isCurrent() && isSameAccount(client, account);
    setBusy(true);
    setNotice("");
    setError(null);
    try {
      const settings = await request(withTimeout(op.signal));
      if (!current()) return;
      // A poll started before the save must not replace its response afterwards.
      await client.cancelQueries({ queryKey: options.queryKey });
      if (!current()) return;
      client.setQueryData(options.queryKey, settings);
      done?.();
      setNotice(m.saved);
    } catch (e) {
      if (current()) setError(e);
    } finally {
      if (op.finish()) setBusy(false);
      settled?.();
    }
  }
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
        {error !== null && (
          <Notice tone="error">{errorMessage(error, m.unknownResult, language)}</Notice>
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
          {owner && <DeliveryCard settings={settings} busy={busy} send={send} />}
          {owner && <CouponsCard settings={settings} busy={busy} send={send} />}
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
