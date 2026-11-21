import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import { reveal } from "@/features/menu/form-values";
import { ServiceNotOffered } from "@/features/accounts/ServiceNotOffered";
import { qrPng } from "@/features/tables/qr-image";
import { isLocalOnlyUrl, publicMenuUrl } from "@/features/tables/qr-url";
import { errorMessage, withTimeout } from "@/lib/api";
import { formatClosingTime, formatWeekdayClosingTime, formatWeekdayTime } from "@/lib/format";
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
  savePickup,
  type OnlineSettings,
} from "./api";
import { pickupMessages } from "./pickup-messages";
import { onlineMessages } from "./messages";
import { FreeDeliverySettings, type FreeDeliveryEdit } from "./FreeDeliverySettings";
import {
  copyDay,
  couponInput,
  deliveryDraft,
  deliveryInput,
  emptyCouponDraft,
  emptyTierDraft,
  MAX_DELIVERY_NOTE_LENGTH,
  MAX_DELIVERY_TIERS,
  normalizePhone,
  originMapsUrl,
  parseOrigin,
  sameDelivery,
  sameHours,
  WEEKDAYS,
  weekDraft,
  weekHours,
  type CouponDraft,
  type CouponProblem,
  type DeliveryDraft,
  type OnlineCoupon,
  type TierDraft,
  type WeekDraft,
} from "./state";

type Messages = (typeof onlineMessages)[Language];
type SettingsWrite = (signal: AbortSignal) => Promise<OnlineSettings>;
// done runs after a current success; settled after every attempt, so a dialog can close either way.
type SendSettings = (request: SettingsWrite, done?: () => void, settled?: () => void) => void;
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

function PhoneCard({
  settings,
  busy,
  send,
  feedback,
  edited,
}: {
  settings: OnlineSettings;
  busy: boolean;
  send: SendSettings;
  feedback: ReactNode;
  edited: () => void;
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

function HoursCard({
  settings,
  busy,
  send,
  feedback,
  edited,
}: {
  settings: OnlineSettings;
  busy: boolean;
  send: SendSettings;
  feedback: ReactNode;
  edited: () => void;
}) {
  const m = onlineMessages[useStaffLanguage()];
  const [draft, setDraft] = useState<WeekDraft | null>(null);
  const [error, setError] = useState("");
  const week = draft ?? weekDraft(settings.hours);
  const parsed = weekHours(week);
  const unchanged = draft === null || (parsed.ok && sameHours(parsed.hours, settings.hours));
  // The day whose slots the copy dialog offers to other days; kept while the dialog closes, and
  // counted so each opening starts with every other day ticked again.
  const [copying, setCopying] = useState<{ from: number; open: boolean; n: number } | null>(null);
  const change = (next: WeekDraft) => {
    edited();
    setError("");
    setDraft(next);
  };
  const edit = (weekday: number, slots: WeekDraft[number]) => change({ ...week, [weekday]: slots });
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
                  <div className="flex flex-wrap gap-2">
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
                    {/* Most restaurants keep the same hours on most days. */}
                    {slots.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setCopying((last) => ({
                            from: weekday,
                            open: true,
                            n: (last?.n ?? 0) + 1,
                          }))
                        }
                      >
                        <Copy />
                        {m.copyDay}
                      </Button>
                    )}
                  </div>
                </fieldset>
              );
            })}
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {feedback}
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
        {copying && (
          <CopyDayDialog
            key={copying.n}
            from={copying.from}
            open={copying.open}
            busy={busy}
            close={() => setCopying({ ...copying, open: false })}
            copy={(to) => {
              change(copyDay(week, copying.from, to));
              setCopying({ ...copying, open: false });
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

// OWNER: the switch, the restaurant's coordinates, the fee bands, the minimum order and the note per
// language, saved together like the week of hours. The switch turns the whole card on, so it comes
// first, and the badge beside the title shows the saved state: a switch changed but not saved never
// reads as delivery being on. Turning it on still needs the coordinates and a band when saving.
// Picks the days that take one day's slots: every other day starts ticked, the usual case.
function CopyDayDialog({
  from,
  open,
  busy,
  close,
  copy,
}: {
  from: number;
  open: boolean;
  busy: boolean;
  close: () => void;
  copy: (to: number[]) => void;
}) {
  const language = useStaffLanguage();
  const m = onlineMessages[language];
  const [to, setTo] = useState<number[]>(() => WEEKDAYS.filter((day) => day !== from));
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {m.copyTitle(m.weekdays[from - 1])}
          </DialogTitle>
          <DialogDescription>{m.copyHint}</DialogDescription>
        </DialogHeader>
        <ul>
          {WEEKDAYS.filter((day) => day !== from).map((day) => (
            <li key={day}>
              <label className="flex min-h-11 items-center gap-3">
                <Checkbox
                  checked={to.includes(day)}
                  onCheckedChange={(checked) =>
                    setTo((days) =>
                      checked ? [...days, day] : days.filter((value) => value !== day),
                    )
                  }
                />
                {m.weekdays[day - 1]}
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {staffMessages[language].cancel}
          </Button>
          <Button disabled={busy || to.length === 0} onClick={() => copy(to)}>
            {m.copyConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const pickupNoticeChoices = [30, 45, 60, 90, 120];

function PickupCard({
  settings,
  busy,
  send,
  feedback,
  edited,
}: {
  settings: OnlineSettings;
  busy: boolean;
  send: SendSettings;
  feedback: ReactNode;
  edited: () => void;
}) {
  const language = useStaffLanguage();
  const m = pickupMessages[language];
  const settingsCopy = onlineMessages[language];
  const saved = settings.pickupMinNoticeMinutes ?? null;
  const savedDays = settings.pickupMaxDaysAhead ?? 1;
  const [draft, setDraft] = useState<{
    enabled: boolean;
    minutes: number;
    days: OnlineSettings["pickupMaxDaysAhead"];
  } | null>(null);
  const value = draft ?? { enabled: saved != null, minutes: saved ?? 60, days: savedDays };
  const next = value.enabled ? value.minutes : null;
  const dirty = next !== saved || (value.enabled && value.days !== savedDays);
  const edit = (value: NonNullable<typeof draft>) => {
    edited();
    setDraft(value);
  };
  return (
    <Card>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && dirty)
              send(
                (signal) => savePickup(next, value.enabled ? value.days : undefined, signal),
                () => setDraft(null),
              );
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{m.title}</h2>
            <Badge variant={saved == null ? "outline" : "success"}>
              {saved == null ? m.off : m.on}
            </Badge>
          </div>
          <Label className="min-h-11 justify-between gap-3">
            {m.enabled}
            <Switch
              checked={value.enabled}
              disabled={busy}
              onCheckedChange={(enabled) => edit({ ...value, enabled })}
            />
          </Label>
          {value.enabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pickup-min-notice">{m.notice}</Label>
                <NativeSelect
                  id="pickup-min-notice"
                  className="w-full"
                  value={value.minutes}
                  disabled={busy}
                  onChange={(event) => edit({ ...value, minutes: Number(event.target.value) })}
                >
                  {pickupNoticeChoices.map((minutes) => (
                    <NativeSelectOption key={minutes} value={minutes}>
                      {m.minutes(minutes)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pickup-max-days">{m.horizon}</Label>
                <NativeSelect
                  id="pickup-max-days"
                  className="w-full"
                  value={value.days}
                  disabled={busy}
                  onChange={(event) => edit({ ...value, days: event.target.value === "7" ? 7 : 1 })}
                >
                  <NativeSelectOption value={1}>{m.tomorrow}</NativeSelectOption>
                  <NativeSelectOption value={7}>{m.weekAhead}</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
          )}
          {feedback}
          <Button type="submit" disabled={busy || !dirty}>
            {settingsCopy.savePickup}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DeliveryCard({
  settings,
  busy,
  send,
  feedback,
  edited,
  saved,
}: {
  settings: OnlineSettings;
  busy: boolean;
  send: SendSettings;
  feedback: ReactNode;
  edited: () => void;
  saved: boolean;
}) {
  const m = onlineMessages[useStaffLanguage()];
  // The local edit survives background refreshes until it is saved or discarded.
  const [draft, setDraft] = useState<DeliveryDraft | null>(null);
  const [freeDeliveryEdit, setFreeDeliveryEdit] = useState<{
    selection: NonNullable<FreeDeliveryEdit>;
    snapshot: DeliveryDraft;
  } | null>(null);
  const [validation, setValidation] = useState<{ message: string; field: string } | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const value = draft ?? freeDeliveryEdit?.snapshot ?? deliveryDraft(settings);
  const parsed = deliveryInput(value);
  const unchanged = draft === null || (parsed.ok && sameDelivery(parsed.input, settings));
  // Keep the success message at the save button after the draft is cleared.
  const keepActionsInView = !unchanged || saved;
  // Fields are marked only after a failed save, beside its message.
  const problem = validation && !parsed.ok ? parsed.problem : null;
  const origin = parseOrigin(value.origin);
  useLayoutEffect(() => {
    if (!validation) return;
    const actions = actionsRef.current;
    const field = document.getElementById(validation.field);
    if (!actions || !field) return;
    // Center the field in the space above the footer, including the newly rendered error.
    field.style.setProperty(
      "scroll-margin-bottom",
      `calc(var(--staff-bottom-bar-height) + ${actions.offsetHeight}px)`,
    );
    reveal(field);
    return () => {
      field.style.removeProperty("scroll-margin-bottom");
    };
  }, [validation]);
  const edit = (next: DeliveryDraft) => {
    edited();
    setValidation(null);
    setDraft(next);
  };
  const editTier = (index: number, patch: Partial<TierDraft>) =>
    edit({
      ...value,
      tiers: value.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    });
  const tierProblem = (index: number, part: "km" | "fee") =>
    problem?.field === "tier" &&
    problem.index === index &&
    (problem.part === part || (part === "km" && problem.part === "repeated"));
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || freeDeliveryEdit !== null) return;
    if (!parsed.ok) {
      const { problem } = parsed;
      const [message, field] =
        problem.field === "origin"
          ? [m.originInvalid, "delivery-origin"]
          : problem.field === "tier"
            ? problem.part === "fee"
              ? [m.tierFeeInvalid(problem.index + 1), `delivery-tier-fee-${problem.index}`]
              : [
                  (problem.part === "km" ? m.tierKmInvalid : m.tierRepeated)(problem.index + 1),
                  `delivery-tier-km-${problem.index}`,
                ]
            : problem.field === "minOrder"
              ? [m.deliveryMinOrderInvalid, "delivery-min-order"]
              : problem.field === "note"
                ? [
                    m.deliveryTooLong(m.noteLanguages[problem.language]),
                    `delivery-note-${problem.language}`,
                  ]
                : [m.setupIncomplete, origin ? "delivery-add-tier" : "delivery-origin"];
      setValidation({ message, field });
      return;
    }
    setValidation(null);
    send(
      (signal) => saveDelivery(parsed.input, signal),
      () => setDraft(null),
    );
  }
  return (
    // Clip the card corners without making the card the sticky footer's scroll container.
    <Card className="overflow-clip">
      <CardContent>
        <form className="space-y-5" onSubmit={save} noValidate>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{m.deliveryTitle}</h2>
              <Badge
                variant={settings.deliveryEnabled ? "success" : "outline"}
                className="whitespace-nowrap"
              >
                {settings.deliveryEnabled ? m.deliveryStatusOn : m.deliveryStatusOff}
              </Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {settings.deliveryAutoQuote ? m.deliveryHintAuto : m.deliveryHint}
            </p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p id="delivery-enabled" className="font-medium">
                {m.deliveryEnabled}
              </p>
              <p className="text-sm leading-5 text-muted-foreground">
                {value.enabled === settings.deliveryEnabled
                  ? value.enabled
                    ? m.deliveryOn
                    : m.deliveryOff
                  : value.enabled
                    ? m.deliveryPendingOn
                    : m.deliveryPendingOff}
              </p>
            </div>
            <Switch
              aria-labelledby="delivery-enabled"
              checked={value.enabled}
              disabled={busy}
              onCheckedChange={(enabled) => edit({ ...value, enabled })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delivery-origin">{m.originLabel}</Label>
            <Input
              id="delivery-origin"
              autoComplete="off"
              spellCheck={false}
              placeholder={m.originPlaceholder}
              value={value.origin}
              disabled={busy}
              aria-invalid={problem?.field === "origin"}
              aria-describedby="delivery-origin-hint"
              onChange={(event) => edit({ ...value, origin: event.target.value })}
            />
            <p id="delivery-origin-hint" className="text-sm leading-6 text-muted-foreground">
              {m.originHint}
            </p>
            {origin && (
              <a
                href={originMapsUrl(origin)}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <ExternalLink />
                {m.originCheck}
              </a>
            )}
          </div>
          <fieldset
            className="space-y-2"
            aria-describedby="delivery-tiers-hint"
            disabled={freeDeliveryEdit !== null}
          >
            <legend className="text-sm font-medium">{m.tiersTitle}</legend>
            <p id="delivery-tiers-hint" className="text-sm leading-6 text-muted-foreground">
              {m.tiersHint}
            </p>
            {value.tiers.map((tier, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Label
                    htmlFor={`delivery-tier-km-${index}`}
                    className={cn("text-xs", index > 0 && "sr-only")}
                  >
                    {index === 0 ? m.tierKm : m.tierKmLabel(index + 1)}
                  </Label>
                  <Input
                    id={`delivery-tier-km-${index}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={tier.km}
                    disabled={busy}
                    aria-invalid={tierProblem(index, "km")}
                    onChange={(event) => editTier(index, { km: event.target.value })}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Label
                    htmlFor={`delivery-tier-fee-${index}`}
                    className={cn("text-xs", index > 0 && "sr-only")}
                  >
                    {index === 0 ? m.tierFee : m.tierFeeLabel(index + 1)}
                  </Label>
                  <Input
                    id={`delivery-tier-fee-${index}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={tier.fee}
                    disabled={busy}
                    aria-invalid={tierProblem(index, "fee")}
                    onChange={(event) => editTier(index, { fee: event.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={m.removeTier(index + 1)}
                  onClick={() =>
                    edit({ ...value, tiers: value.tiers.filter((_, i) => i !== index) })
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              id="delivery-add-tier"
              type="button"
              variant="ghost"
              disabled={busy || value.tiers.length >= MAX_DELIVERY_TIERS}
              onClick={() => edit({ ...value, tiers: [...value.tiers, emptyTierDraft] })}
            >
              <Plus />
              {m.addTier}
            </Button>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="delivery-min-order">{m.deliveryMinOrder}</Label>
            <Input
              id="delivery-min-order"
              className="max-w-40"
              inputMode="decimal"
              autoComplete="off"
              value={value.minOrder}
              disabled={busy}
              aria-invalid={problem?.field === "minOrder"}
              aria-describedby="delivery-min-order-hint"
              onChange={(event) => edit({ ...value, minOrder: event.target.value })}
            />
            <p id="delivery-min-order-hint" className="text-sm leading-6 text-muted-foreground">
              {m.deliveryMinOrderHint}
            </p>
          </div>
          <FreeDeliverySettings
            tiers={value.tiers}
            savedTiers={draft ? settings.deliveryTiers : undefined}
            editing={freeDeliveryEdit?.selection ?? null}
            busy={busy}
            onEdit={(selection) =>
              setFreeDeliveryEdit(selection === null ? null : { selection, snapshot: value })
            }
            onApply={(tiers) => {
              if (
                tiers.some(
                  (tier, index) =>
                    tier.freeDeliveryMinCents !== value.tiers[index].freeDeliveryMinCents,
                )
              )
                edit({ ...value, tiers });
              setFreeDeliveryEdit(null);
            }}
          />
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
                aria-invalid={problem?.field === "note" && problem.language === language}
                onChange={(event) =>
                  edit({ ...value, notes: { ...value.notes, [language]: event.target.value } })
                }
              />
            </div>
          ))}
          <div
            ref={actionsRef}
            className={cn(
              "space-y-3 bg-card",
              keepActionsInView && "sticky bottom-(--staff-bottom-bar-height) z-10 border-t py-3",
            )}
          >
            {validation ? <Notice tone="error">{validation.message}</Notice> : feedback}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                className="px-3 md:px-4"
                disabled={busy || unchanged || freeDeliveryEdit !== null}
              >
                {m.saveDelivery}
              </Button>
              {draft !== null && (
                <Button
                  type="button"
                  variant="outline"
                  className="px-3 md:px-4"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    setValidation(null);
                    setFreeDeliveryEdit(null);
                  }}
                >
                  {m.discardChanges}
                </Button>
              )}
            </div>
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
  feedback,
  edited,
}: {
  settings: OnlineSettings;
  busy: boolean;
  send: SendSettings;
  feedback: ReactNode;
  edited: () => void;
}) {
  const m = onlineMessages[useStaffLanguage()];
  const [draft, setDraft] = useState<CouponDraft>(emptyCouponDraft);
  const dateRef = useRef<HTMLInputElement>(null);
  const [dateBadInput, setDateBadInput] = useState(false);
  const [tried, setTried] = useState(false);
  const [deleting, setDeleting] = useState<OnlineCoupon | null>(null);
  const parsed = couponInput(draft, dateBadInput);
  const change = (next: CouponDraft) => {
    edited();
    setDraft(next);
  };
  const problem = (kind: CouponProblem) => tried && !parsed.ok && parsed.problems.includes(kind);
  const hint = (kind: CouponProblem) =>
    cn("text-sm", problem(kind) ? "text-destructive" : "text-muted-foreground");
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const date = dateRef.current;
    if (!date) return;
    // Read the control again: partial edits can leave value empty without React firing onChange.
    const checked = couponInput({ ...draft, validUntil: date.value }, date.validity.badInput);
    setDateBadInput(date.validity.badInput);
    setTried(true);
    if (!checked.ok) return;
    const input = checked.input;
    send(
      (signal) => createCoupon(input, signal),
      () => {
        setDraft(emptyCouponDraft);
        setDateBadInput(false);
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
                onChange={(event) => change({ ...draft, code: event.target.value.toUpperCase() })}
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
                onChange={(event) => change({ ...draft, percent: event.target.value })}
              />
              <p id="coupon-percent-hint" className={hint("percent")}>
                {problem("percent") ? m.couponPercentProblem : m.couponPercentHint}
              </p>
            </div>
            <div className="min-w-0 space-y-2 sm:col-span-2">
              <Label htmlFor="coupon-valid-until">{m.couponValidUntil}</Label>
              <Input
                id="coupon-valid-until"
                ref={dateRef}
                type="date"
                value={draft.validUntil}
                disabled={busy}
                aria-invalid={problem("date")}
                aria-describedby="coupon-valid-until-hint"
                onInput={(event) => setDateBadInput(event.currentTarget.validity.badInput)}
                onChange={(event) => change({ ...draft, validUntil: event.target.value })}
              />
              <p id="coupon-valid-until-hint" className={hint("date")}>
                {problem("date") ? m.couponDateProblem : m.couponValidUntilHint}
              </p>
            </div>
          </div>
          {feedback}
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
          {owner && <HoursCard settings={settings} {...cardProps("hours")} />}
          {owner && <PickupCard settings={settings} {...cardProps("pickup")} />}
          {owner && (
            <DeliveryCard
              settings={settings}
              {...cardProps("delivery")}
              saved={outcome?.card === "delivery" && outcome.error === null}
            />
          )}
          {owner && <CouponsCard settings={settings} {...cardProps("coupons")} />}
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
