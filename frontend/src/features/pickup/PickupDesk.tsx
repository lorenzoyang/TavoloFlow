import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Phone } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FilterChips } from "@/components/filter-chips";
import { MasterDetail } from "@/components/master-detail";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import { billingKey } from "@/features/billing/api";
import { kitchenKey } from "@/features/kitchen/api";
import { pickupChime } from "@/lib/alert-sound";
import { ApiError, errorMessage, withTimeout } from "@/lib/api";
import { formatMoney, formatTime } from "@/lib/format";
import { displayName } from "@/lib/language";
import { staffMessages } from "@/lib/staff-messages";
import { useAlertSound } from "@/lib/useAlertSound";
import { useLiveView } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import {
  acceptPickup,
  pendingPickupsQuery,
  pickupKey,
  rejectPickup,
  type PendingPickup,
  type RejectReason,
} from "./api";
import { pickupMessages } from "./messages";

const ESTIMATES = [15, 20, 30, 45] as const;
const RING_EVERY_MS = 4000;

function PendingCard({
  request,
  now,
  busy,
  accept,
  reject,
}: {
  request: PendingPickup;
  now: number;
  busy: boolean;
  accept: (minutes: number) => void;
  reject: () => void;
}) {
  const language = useStaffLanguage();
  const m = pickupMessages[language];
  const c = staffMessages[language];
  const waited = Math.max(0, Math.floor((now - Date.parse(request.submittedAt)) / 60_000));
  const left = Math.max(0, Math.ceil((Date.parse(request.expiresAt) - now) / 60_000));
  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
      <header className="space-y-1">
        <div className="flex items-baseline gap-2">
          <h3 className="text-2xl font-bold tabular-nums">#{request.pickupNumber}</h3>
          <p className="min-w-0 truncate text-lg font-semibold">{request.customerName}</p>
        </div>
        <a
          href={`tel:${request.customerPhone}`}
          className="inline-flex min-h-11 items-center gap-2 font-medium tabular-nums"
        >
          <Phone aria-hidden="true" className="size-4" />
          {request.customerPhone}
        </a>
        <p className="text-sm text-muted-foreground">
          {formatTime(request.submittedAt, language)} · {m.waited(waited)} · {m.left(left)}
        </p>
      </header>
      <ul className="space-y-1.5">
        {request.items.map((line, index) => {
          const name = displayName(line, request.defaultLanguage, language);
          return (
            <li key={index}>
              <p lang={name.language} className="font-medium wrap-break-word">
                {line.quantity} × {name.text}
              </p>
              {line.remark && (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground wrap-break-word">
                  {c.remark(line.remark)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="flex justify-between gap-3 border-t pt-3 font-semibold">
        <span>{m.total}</span>
        <span className="tabular-nums">{formatMoney(request.totalAmountCents, language)}</span>
      </p>
      <div className="space-y-2">
        <p className="text-sm font-medium">{m.acceptWith}</p>
        {/* One tap accepts and sets the time: the time is itself the deliberate choice. */}
        <div className="grid grid-cols-4 gap-2">
          {ESTIMATES.map((minutes) => (
            <Button
              key={minutes}
              disabled={busy}
              aria-label={m.acceptLabel(request.pickupNumber, minutes)}
              className="whitespace-nowrap"
              onClick={() => accept(minutes)}
            >
              {m.minutes(minutes)}
            </Button>
          ))}
        </div>
        <Button variant="outline" className="w-full" disabled={busy} onClick={reject}>
          {m.reject}
        </Button>
      </div>
    </article>
  );
}

// On every staff page while pickup is on: polls the waiting requests, shows the banner and rings in a loop
// until none waits. There is no mute; only accepting or rejecting stops it. The panel is a non-modal column
// on wide screens and a sheet below, like every detail view.
export function PickupDesk({
  account,
  children,
}: {
  account: CurrentAccount;
  children: ReactNode;
}) {
  const language = useStaffLanguage();
  const m = pickupMessages[language];
  const c = staffMessages[language];
  const client = useQueryClient();
  const view = useLiveView();
  const pending = useQuery({
    ...pendingPickupsQuery(account),
    enabled: view.active,
    refetchInterval: view.active ? 10_000 : false,
  });
  const requests = pending.data?.items ?? [];
  const limit = pending.data?.limit ?? 20;
  const { play, ...sound } = useAlertSound(null, pickupChime);
  const ringing = requests.length > 0 && view.active;
  useEffect(() => {
    if (!ringing) return;
    play();
    const timer = window.setInterval(play, RING_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [ringing, play]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<PendingPickup | null>(null);
  const [reason, setReason] = useState<RejectReason | "">("");
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);

  // No pending marker is stored: a decision only applies to a request still waiting, so a repeat returns
  // PICKUP_CHANGED, and the refreshed list shows whether a lost write went through.
  async function decide(
    id: string,
    send: (signal: AbortSignal) => Promise<unknown>,
    done: () => string,
  ) {
    if (busy || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(id);
    setNotice(null);
    try {
      await send(withTimeout(controller.signal));
      if (isSameAccount(client, account)) setNotice({ tone: "success", text: done() });
    } catch (e) {
      if (!controller.signal.aborted && isSameAccount(client, account))
        setNotice({
          tone: "error",
          text:
            e instanceof ApiError && e.code === "PICKUP_CHANGED"
              ? m.changed
              : errorMessage(e, m.unknown, language),
        });
    } finally {
      operation.current = null;
      setBusy(null);
      setRejecting(null);
      for (const key of [pickupKey(account), kitchenKey(account), billingKey(account)])
        void client.invalidateQueries({ queryKey: key });
    }
  }
  const panel = (
    <div className="space-y-4">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {pending.isError && <Notice tone="error">{m.deskError}</Notice>}
      {requests.length === 0 && <p className="text-muted-foreground">{m.deskEmpty}</p>}
      {requests.map((request) => (
        <PendingCard
          key={request.id}
          request={request}
          now={view.now}
          busy={!!busy || !view.active}
          accept={(minutes) =>
            void decide(
              request.id,
              (signal) => acceptPickup(request.id, minutes, signal),
              () =>
                m.accepted(
                  request.pickupNumber,
                  formatTime(Date.now() + minutes * 60_000, language),
                ),
            )
          }
          reject={() => {
            setReason("");
            setRejecting(request);
          }}
        />
      ))}
    </div>
  );
  return (
    <MasterDetail
      open={open}
      title={m.deskTitle}
      closeLabel={c.close}
      onClose={() => setOpen(false)}
      detail={panel}
    >
      {sound.soundBlocked && (
        <Notice tone="warning" className="mb-4">
          {m.soundBlocked}
        </Notice>
      )}
      {requests.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="mb-4 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-warning px-4 py-3 text-left text-warning-foreground shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <BellRing aria-hidden="true" className="size-5 shrink-0 animate-pulse" />
          <span role="status" className="min-w-0 flex-1 font-semibold">
            {requests.length >= limit ? m.bannerFull(limit) : m.banner(requests.length)}
          </span>
          <span className="shrink-0 font-medium underline underline-offset-4">{m.view}</span>
        </button>
      )}
      {children}
      <ConfirmDialog
        open={!!rejecting}
        title={rejecting ? m.rejectTitle(rejecting.pickupNumber) : ""}
        description={m.rejectDescription}
        confirmLabel={m.confirmReject}
        cancelLabel={c.cancel}
        tone="destructive"
        busy={!!busy}
        onCancel={() => setRejecting(null)}
        onConfirm={() => {
          if (!rejecting) return;
          const target = rejecting;
          void decide(
            target.id,
            (signal) => rejectPickup(target.id, reason || null, signal),
            () => m.rejected(target.pickupNumber),
          );
        }}
      >
        {/* min-w-0 lets the chips scroll inside the dialog instead of widening it past a phone screen. */}
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium">{m.reasonLabel}</p>
          <FilterChips
            label={m.reasonLabel}
            value={reason}
            onChange={(value) => setReason(value as RejectReason | "")}
            items={[
              { value: "", label: m.noReason },
              { value: "SOLD_OUT", label: m.reasons.SOLD_OUT },
              { value: "BUSY", label: m.reasons.BUSY },
              { value: "CLOSING", label: m.reasons.CLOSING },
            ]}
          />
        </div>
      </ConfirmDialog>
    </MasterDetail>
  );
}
