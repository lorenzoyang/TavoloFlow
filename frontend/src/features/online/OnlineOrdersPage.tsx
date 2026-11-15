import { useEffect, useState } from "react";
import { Phone, RefreshCw, ShoppingBag } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { ServiceNotOffered } from "@/features/accounts/ServiceNotOffered";
import { closeOrderNotifications } from "@/features/push/device";
import { formatMoney, formatTime } from "@/lib/format";
import { displayName, type Language } from "@/lib/language";
import { optionSummary } from "@/lib/options";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import type { OnlineActiveOrder, OnlinePendingPage, OnlinePendingRequest } from "./api";
import { DeliveryAddress } from "./DeliveryAddress";
import { onlineOrdersMessages } from "./messages";
import {
  acceptFee,
  activeProgress,
  DELIVERY_MINUTES,
  formatCountdown,
  PICKUP_MINUTES,
  rejectReasons,
  requestTimes,
  type RejectReason,
} from "./state";
import { useOnlineOrders } from "./useOnlineOrders";

type Model = ReturnType<typeof useOnlineOrders>;

const progressBadges = { preparing: "warning", ready: "success", cancelled: "outline" } as const;

// Less than this left: the countdown turns red, so someone decides before the request expires.
const URGENT_SECONDS = 180;

function CallLink({ phone, label }: { phone: string; label: string }) {
  return (
    <a href={`tel:${phone}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
      <Phone />
      {label}
    </a>
  );
}

// An amount that never wraps between the euro sign and the digits inside a longer line.
const amount = (cents: number, language: Language) =>
  formatMoney(cents, language).replace(" ", "\u00a0");

function PendingCard({
  request,
  page,
  model,
  onReject,
}: {
  request: OnlinePendingRequest;
  page: OnlinePendingPage;
  model: Model;
  onReject: (request: OnlinePendingRequest) => void;
}) {
  const language = useStaffLanguage();
  const m = onlineOrdersMessages[language];
  const c = staffMessages[language];
  const times = requestTimes(request, page.now, page.receivedAt, model.view.now);
  const disabled = !model.fresh || !!model.busy || times.remainingSeconds === 0;
  const delivery = request.fulfillment === "DELIVERY";
  // Delivery is accepted with the fee whoever accepts enters: explicitly, 0 when free.
  const [feeText, setFeeText] = useState("");
  const fee = acceptFee(feeText, request.itemsTotalCents);
  const feeId = `delivery-fee-${request.id}`;
  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-2xl font-bold">
            <span className="tabular-nums">#{request.number}</span>
            <Badge variant="secondary">{m.fulfillment[request.fulfillment]}</Badge>
          </h3>
          {request.customerName && (
            <p className="text-lg font-medium wrap-break-word">{request.customerName}</p>
          )}
        </div>
        <div className="shrink-0 text-right text-sm">
          <p className="text-muted-foreground">{m.waited(times.waitedMinutes)}</p>
          <p
            className={cn(
              "font-semibold tabular-nums",
              times.remainingSeconds < URGENT_SECONDS && "text-destructive",
            )}
          >
            {m.remaining(formatCountdown(times.remainingSeconds))}
          </p>
        </div>
      </header>
      {request.customerPhone && (
        <CallLink phone={request.customerPhone} label={m.call(request.customerPhone)} />
      )}
      {delivery && request.deliveryAddress && (
        <DeliveryAddress address={request.deliveryAddress} notes={request.deliveryNotes} />
      )}
      <ul className="divide-y border-y">
        {request.items.map((line, index) => {
          const name = displayName(line, request.defaultLanguage, language);
          return (
            <li key={index} className="space-y-1 py-2">
              <div className="flex items-start justify-between gap-3">
                <p lang={name.language} className="min-w-0 font-medium wrap-break-word">
                  {line.quantity} × {name.text}
                </p>
                <p className="shrink-0 tabular-nums">
                  {formatMoney(line.unitPriceCents * line.quantity, language)}
                </p>
              </div>
              {line.options.length > 0 && (
                <p className="text-sm text-muted-foreground wrap-break-word">
                  {optionSummary(line.options, request.defaultLanguage, language)}
                </p>
              )}
              {line.remark && (
                <p className="rounded-lg bg-warning/20 px-2.5 py-1.5 text-sm whitespace-pre-wrap wrap-break-word">
                  {c.remark(line.remark)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-right font-semibold tabular-nums">
        {m.subtotal(formatMoney(request.itemsTotalCents, language))}
      </p>
      <div className="space-y-2">
        {delivery && (
          <div className="space-y-2">
            <Label htmlFor={feeId}>{m.deliveryFee}</Label>
            <Input
              id={feeId}
              inputMode="decimal"
              autoComplete="off"
              value={feeText}
              disabled={disabled}
              aria-invalid={feeText.trim() !== "" && fee === null}
              aria-describedby={`${feeId}-hint`}
              onChange={(event) => setFeeText(event.target.value)}
            />
            <p id={`${feeId}-hint`} className="text-sm text-muted-foreground">
              {feeText.trim() !== "" && fee === null ? m.feeInvalid : m.deliveryFeeHint}
            </p>
            {fee !== null && (
              <p className="rounded-xl bg-secondary px-3 py-2 text-sm font-semibold tabular-nums">
                {m.deliveryTotal(
                  amount(request.itemsTotalCents, language),
                  amount(fee, language),
                  amount(request.itemsTotalCents + fee, language),
                )}
              </p>
            )}
          </div>
        )}
        <p className="text-sm font-medium">{delivery ? m.acceptWithDelivery : m.acceptWith}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(delivery ? DELIVERY_MINUTES : PICKUP_MINUTES).map((minutes) => (
            <Button
              key={minutes}
              size="lg"
              disabled={disabled || (delivery && fee === null)}
              aria-label={
                delivery
                  ? m.acceptDeliveryLabel(request.number, minutes)
                  : m.acceptLabel(request.number, minutes)
              }
              onClick={() => void model.accept(request, minutes, delivery ? fee : null)}
            >
              {m.minutes(minutes)}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          className="w-full text-destructive"
          disabled={disabled}
          onClick={() => onReject(request)}
        >
          {m.reject}
        </Button>
      </div>
    </article>
  );
}

// Read only: the one place STAFF find an accepted customer's phone, since the kitchen and pass never
// show it and STAFF have no bills page.
function ActiveCard({ order }: { order: OnlineActiveOrder }) {
  const language = useStaffLanguage();
  const m = onlineOrdersMessages[language];
  const progress = activeProgress(order);
  return (
    <article className="space-y-2 rounded-2xl border bg-card p-4 shadow-xs">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-xl font-bold">
            <span className="tabular-nums">#{order.number}</span>
            <Badge variant="secondary">{m.fulfillment[order.channel]}</Badge>
          </h3>
          {order.customerName && (
            <p className="font-medium wrap-break-word">{order.customerName}</p>
          )}
        </div>
        <Badge variant={progressBadges[progress]}>{m.progress[progress]}</Badge>
      </header>
      <p className="text-sm">{m.estimated(formatTime(order.estimatedAt, language))}</p>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold tabular-nums">
          {m.toCollect(formatMoney(order.totalAmountCents, language))}
        </span>
        {order.deliveryFeeCents !== null && progress !== "cancelled" && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {m.feeIncluded(formatMoney(order.deliveryFeeCents, language))}
          </span>
        )}
      </p>
      {order.customerPhone && (
        <CallLink phone={order.customerPhone} label={m.call(order.customerPhone)} />
      )}
      {order.channel === "DELIVERY" && order.deliveryAddress && (
        <DeliveryAddress address={order.deliveryAddress} notes={order.deliveryNotes} />
      )}
    </article>
  );
}

function OnlineOrdersContent({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = onlineOrdersMessages[language];
  const c = staffMessages[language];
  const model = useOnlineOrders(account);
  const [rejecting, setRejecting] = useState<OnlinePendingRequest | null>(null);
  const [reason, setReason] = useState<RejectReason | null>(null);
  const page = model.pending.data;
  const active = model.active.data?.items ?? [];
  const fetching = model.pending.isFetching || model.active.isFetching;
  // Opening the page, or returning to it, answers the lock-screen notifications on this device.
  useEffect(() => {
    if (model.view.active) void closeOrderNotifications().catch(() => undefined);
  }, [model.view.active]);
  async function reject() {
    if (!rejecting) return;
    await model.reject(rejecting, reason);
    setRejecting(null);
  }
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
            disabled={!model.view.active || fetching}
            onClick={model.refresh}
          >
            <RefreshCw className={cn(fetching && "animate-spin")} />
          </Button>
        }
      />
      <div className="space-y-3">
        {model.notice && <Notice tone={model.notice.tone}>{model.notice.text}</Notice>}
        {(model.pending.isError || model.active.isError) && (
          <Notice tone="error">{m.readError}</Notice>
        )}
        {model.stalled && !model.pending.isError && <Notice tone="warning">{m.stale}</Notice>}
      </div>
      <section aria-labelledby="online-pending" className="mt-4 space-y-3">
        <h2 id="online-pending" className="text-lg font-semibold">
          {m.pendingTitle(page?.items.length ?? 0)}
        </h2>
        {!page && model.pending.isPending && <LoadingState label={m.loading} />}
        {page && page.items.length === 0 && (
          <EmptyState icon={ShoppingBag} title={m.noPending} description={m.noPendingHint} />
        )}
        {page?.items.map((request) => (
          <PendingCard
            key={request.id}
            request={request}
            page={page}
            model={model}
            onReject={(target) => {
              setReason(null);
              setRejecting(target);
            }}
          />
        ))}
      </section>
      <section aria-labelledby="online-active" className="mt-8 space-y-3">
        <h2 id="online-active" className="text-lg font-semibold">
          {m.activeTitle(active.length)}
        </h2>
        {model.active.data && active.length === 0 && (
          <p className="text-sm leading-6 text-muted-foreground">
            {m.noActive} · {m.noActiveHint}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((order) => (
            <ActiveCard key={order.sessionId} order={order} />
          ))}
        </div>
      </section>
      <ConfirmDialog
        open={!!rejecting}
        tone="destructive"
        title={rejecting ? m.rejectTitle(rejecting.number) : ""}
        description={m.rejectHint}
        confirmLabel={m.rejectConfirm}
        busy={!!rejecting && model.busy === rejecting.id}
        confirmDisabled={!model.fresh || !!model.busy}
        onConfirm={() => void reject()}
        onCancel={() => setRejecting(null)}
      >
        <RadioGroup
          value={reason ?? "NONE"}
          onValueChange={(value) => setReason(value === "NONE" ? null : (value as RejectReason))}
          aria-label={m.rejectHint}
        >
          {(["NONE", ...rejectReasons(rejecting?.fulfillment ?? "PICKUP")] as const).map(
            (value) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-colors has-data-checked:border-primary/40 has-data-checked:bg-accent"
              >
                <RadioGroupItem value={value} />
                {value === "NONE" ? m.noReason : m.reasons[value]}
              </label>
            ),
          )}
        </RadioGroup>
      </ConfirmDialog>
    </div>
  );
}

export function OnlineOrdersPage() {
  return (
    <AuthBoundary mode="account">
      {(account) =>
        account.services.online ? (
          <OnlineOrdersContent
            key={`${account.restaurantId}:${account.userId}`}
            account={account}
          />
        ) : (
          <ServiceNotOffered messages={onlineOrdersMessages} backToHome />
        )
      }
    </AuthBoundary>
  );
}
