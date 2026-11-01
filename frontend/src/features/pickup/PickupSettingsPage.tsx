import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink, Phone, Plus, RefreshCw, X } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { ServiceNotOffered } from "@/features/accounts/ServiceNotOffered";
import { isLocalOnlyUrl, publicMenuUrl } from "@/features/tables/qr-url";
import { formatMoney, formatOpening, formatTime } from "@/lib/format";
import { staffMessages } from "@/lib/staff-messages";
import { useLiveView } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { onlineMenuPath, unacceptedPickupsQuery, type PickupSettings } from "./api";
import { pickupMessages } from "./messages";
import { draftHours, hoursDraft, windowText, type HourDraft, type PickupHour } from "./state";
import { usePickupSettings } from "./usePickupSettings";

// The online menu link as text, copy button and a downloadable QR code for flyers and bags.
function OnlineMenuLink({ slug }: { slug: string }) {
  const m = pickupMessages[useStaffLanguage()];
  let url = "";
  try {
    url = publicMenuUrl(
      onlineMenuPath(slug),
      window.location.origin,
      import.meta.env.VITE_PUBLIC_BASE_URL,
    );
  } catch {
    /* Reported below. */
  }
  const [image, setImage] = useState<{ url: string; data?: string; error?: boolean }>();
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 1024,
      margin: 4,
      errorCorrectionLevel: "M",
      type: "image/png",
      color: { dark: "#000000ff", light: "#ffffffff" },
    })
      .then((data) => {
        if (!cancelled) setImage({ url, data });
      })
      .catch(() => {
        if (!cancelled) setImage({ url, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (!url) return <Notice tone="error">{m.configError}</Notice>;
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
    <div className="space-y-4">
      {current?.error ? (
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
      {isLocalOnlyUrl(url) && <Notice tone="warning">{m.localOnly}</Notice>}
      <Input aria-label={m.link} value={url} readOnly onFocus={(event) => event.target.select()} />
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
          {m.open}
        </a>
        {current?.data && (
          <a
            className={cn(buttonVariants({ variant: "outline" }), "col-span-2")}
            href={current.data}
            download={`tavoloflow-online-menu-${slug}.png`}
          >
            <Download />
            {m.downloadQr}
          </a>
        )}
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </div>
  );
}

// OWNER edits the whole week; the form keeps its own copy while background refreshes arrive.
function HoursEditor({
  settings,
  save,
  busy,
}: {
  settings: PickupSettings;
  save: (hours: PickupHour[]) => Promise<boolean>;
  busy: boolean;
}) {
  const language = useStaffLanguage();
  const m = pickupMessages[language];
  const [draft, setDraft] = useState<HourDraft[] | null>(null);
  const [problem, setProblem] = useState("");
  const days = draft ?? hoursDraft(settings.hours);
  function change(weekday: number, next: HourDraft["slots"]) {
    setProblem("");
    setDraft(days.map((day) => (day.weekday === weekday ? { ...day, slots: next } : day)));
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!draft) return;
        const result = draftHours(draft);
        if ("problem" in result) {
          setProblem(m.hoursProblem(m.weekdays[result.weekday - 1], result.problem));
          return;
        }
        if (await save(result.hours)) setDraft(null);
      }}
    >
      <ul className="divide-y">
        {days.map((day) => {
          const name = m.weekdays[day.weekday - 1];
          return (
            <li
              key={day.weekday}
              className="grid gap-2 py-3 sm:grid-cols-[4rem_minmax(0,1fr)] sm:items-start"
            >
              <span className="pt-2.5 font-medium">{name}</span>
              <div className="space-y-2">
                {day.slots.length === 0 && (
                  <p className="text-sm text-muted-foreground">{m.closedDay}</p>
                )}
                {day.slots.map((slot, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${name} ${m.opens}`}
                      value={slot.opens}
                      disabled={busy}
                      className="min-w-0 flex-1"
                      onChange={(event) =>
                        change(
                          day.weekday,
                          day.slots.map((s, i) =>
                            i === index ? { ...s, opens: event.target.value } : s,
                          ),
                        )
                      }
                    />
                    <span aria-hidden="true">–</span>
                    <Input
                      type="time"
                      aria-label={`${name} ${m.closes}`}
                      value={slot.closes}
                      disabled={busy}
                      className="min-w-0 flex-1"
                      onChange={(event) =>
                        change(
                          day.weekday,
                          day.slots.map((s, i) =>
                            i === index ? { ...s, closes: event.target.value } : s,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={m.removeSlot(name, index + 1)}
                      disabled={busy}
                      onClick={() =>
                        change(
                          day.weekday,
                          day.slots.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                {day.slots.length < 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      change(day.weekday, [
                        ...day.slots,
                        day.slots.length === 0
                          ? { opens: "11:00", closes: "14:30" }
                          : { opens: "18:00", closes: "22:00" },
                      ])
                    }
                  >
                    <Plus />
                    {m.addSlot}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {problem && <Notice tone="error">{problem}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !draft}>
          {m.saveHours}
        </Button>
        {draft && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setProblem("");
            }}
          >
            {m.resetHours}
          </Button>
        )}
      </div>
    </form>
  );
}

// Today's requests that never became orders, so staff can call guests back and the owner sees what was missed.
function UnacceptedList({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = pickupMessages[language];
  const view = useLiveView();
  const list = useQuery({ ...unacceptedPickupsQuery(account), enabled: view.active });
  return (
    <Card>
      <CardContent className="space-y-3">
        <h2 className="font-semibold">{m.unaccepted}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{m.unacceptedHint}</p>
        {list.isError && <Notice tone="error">{m.unacceptedError}</Notice>}
        {list.data && list.data.items.length === 0 && (
          <p className="text-muted-foreground">{m.noUnaccepted}</p>
        )}
        <ul className="divide-y">
          {list.data?.items.map((row) => (
            <li key={row.pickupNumber} className="space-y-1 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="flex min-w-0 items-baseline gap-2">
                  <span className="font-semibold tabular-nums">#{row.pickupNumber}</span>
                  <span className="truncate">{row.customerName}</span>
                </p>
                <Badge variant="outline" className="shrink-0">
                  {row.rejectReason
                    ? `${m.outcomes[row.outcome]} · ${m.reasons[row.rejectReason]}`
                    : m.outcomes[row.outcome]}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm text-muted-foreground">
                <a
                  href={`tel:${row.customerPhone}`}
                  className="inline-flex min-h-11 items-center gap-1.5 tabular-nums"
                >
                  <Phone aria-hidden="true" className="size-3.5" />
                  {row.customerPhone}
                </a>
                <span className="tabular-nums">
                  {formatTime(row.submittedAt, language)} ·{" "}
                  {formatMoney(row.totalAmountCents, language)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PickupSettingsContent({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = pickupMessages[language];
  const c = staffMessages[language];
  const model = usePickupSettings(account);
  const { settings, view, notice, busy, error } = model;
  const data = settings.data;
  const owner = account.role === "OWNER";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={m.title}
        description={m.description}
        back={{ to: "/staff", label: c.home }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refresh}
            disabled={!view.active || settings.isFetching}
            onClick={() => void settings.refetch()}
          >
            <RefreshCw className={cn(settings.isFetching && "animate-spin")} />
          </Button>
        }
      />
      {settings.isPending && <LoadingState label={m.loading} />}
      {settings.isError && (
        <Notice tone="error" className="mb-5">
          {m.loadError}
        </Notice>
      )}
      {error && (
        <Notice tone="error" className="mb-5">
          {error}
        </Notice>
      )}
      {notice && !error && (
        <Notice tone="success" className="mb-5">
          {notice}
        </Notice>
      )}
      {data && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">{m.status}</h2>
                <Badge variant={data.status === "OPEN" ? "success" : "outline"}>
                  {m.statuses[data.status]}
                </Badge>
              </div>
              {data.status === "CLOSED_HOURS" && data.nextOpensAt && (
                <p className="text-sm text-muted-foreground">
                  {m.nextOpens(formatOpening(data.nextOpensAt, language, view.now))}
                </p>
              )}
              {data.hours.length === 0 && <Notice tone="warning">{m.noHours}</Notice>}
              <div className="flex items-center justify-between gap-4 border-t pt-4">
                <div className="min-w-0">
                  <p id="pickup-paused" className="font-medium">
                    {m.pause}
                  </p>
                  <p className="text-sm leading-5 text-muted-foreground">
                    {data.paused ? m.pausedOn : m.pausedOff}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {busy && <Spinner />}
                  <Switch
                    aria-labelledby="pickup-paused"
                    checked={data.paused}
                    disabled={busy || settings.isError || !view.active}
                    onCheckedChange={model.togglePause}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3">
              <h2 className="font-semibold">{m.link}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{m.linkHint}</p>
              {data.slug ? <OnlineMenuLink slug={data.slug} /> : <Notice>{m.noLink}</Notice>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2">
              <h2 className="font-semibold">{m.phone}</h2>
              {data.phone ? (
                <a
                  href={`tel:${data.phone}`}
                  className="inline-flex min-h-11 items-center gap-2 text-lg font-medium tabular-nums"
                >
                  <Phone aria-hidden="true" className="size-4" />
                  {data.phone}
                </a>
              ) : (
                <p className="text-muted-foreground">{m.noPhone}</p>
              )}
              <p className="text-sm leading-6 text-muted-foreground">{m.phoneHint}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3">
              <h2 className="font-semibold">{m.hours}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{m.hoursHint}</p>
              {owner ? (
                <HoursEditor settings={data} save={model.saveHours} busy={busy || !view.active} />
              ) : (
                <>
                  <dl className="divide-y">
                    {hoursDraft(data.hours).map((day) => (
                      <div key={day.weekday} className="flex justify-between gap-4 py-2">
                        <dt className="font-medium">{m.weekdays[day.weekday - 1]}</dt>
                        <dd className="text-right tabular-nums">
                          {data.hours
                            .filter((h) => h.weekday === day.weekday)
                            .map(windowText)
                            .join(" · ") || m.closedDay}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-sm text-muted-foreground">{m.ownerHours}</p>
                </>
              )}
            </CardContent>
          </Card>
          <UnacceptedList account={account} />
        </div>
      )}
    </div>
  );
}

export function PickupSettingsPage() {
  return (
    <AuthBoundary mode="account">
      {(account) =>
        account.services.pickup ? (
          <PickupSettingsContent
            key={`${account.restaurantId}:${account.userId}`}
            account={account}
          />
        ) : (
          <ServiceNotOffered />
        )
      }
    </AuthBoundary>
  );
}
