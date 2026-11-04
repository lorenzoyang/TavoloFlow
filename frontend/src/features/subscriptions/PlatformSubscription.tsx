import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { formatCents, formatMoney, parsePrice } from "@/lib/format";
import { randomUuid } from "@/lib/ids";
import { cn } from "@/lib/utils";
import { onLifecycleChange } from "@/lib/useLiveView";
import {
  adjustExpiry,
  confirmPayment,
  createPeriod,
  editPeriod,
  getSubscription,
  platformSubscriptionKey,
  saveSubscription,
} from "./api";
import { PeriodFields } from "./PeriodFields";
import { useSubscriptionQuery } from "./queries";
import {
  periodFromForm,
  renewalStart,
  type SubscriptionPeriod,
  type SubscriptionSummary,
} from "./state";
import { PeriodDetails, SubscriptionStatus } from "./SubscriptionViews";
import { useSubscriptionActions } from "./useSubscriptionActions";
import { platformSubscriptionMessages } from "./messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";

type Editor = {
  kind: "metadata" | "create" | "edit" | "expiry" | "payment";
  summary: SubscriptionSummary;
  period?: SubscriptionPeriod;
};
type Confirmation = {
  version: number;
  description: string;
  send: (signal: AbortSignal) => Promise<unknown>;
};

export function PlatformSubscription({
  userId,
  restaurantId,
}: {
  userId: string;
  restaurantId: string;
}) {
  const language = useStaffLanguage();
  const m = platformSubscriptionMessages[language];
  const money = (cents: number) => formatMoney(cents, language);
  const detail = useSubscriptionQuery(platformSubscriptionKey(userId, restaurantId), (signal) =>
    getSubscription(restaurantId, signal),
  );
  const summary = detail.data?.summary;
  const periods = detail.data?.periods;
  const actions = useSubscriptionActions(userId);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [validation, setValidation] = useState("");
  useEffect(() => onLifecycleChange(() => setConfirmation(null)), []);
  // Background refreshes block submission but never disable inputs that are being typed into.
  const locked = actions.busy || detail.stale || detail.isFetching || !summary;
  const open = (kind: Editor["kind"], period?: SubscriptionPeriod) => {
    if (!summary || locked) return;
    setValidation("");
    setConfirmation(null);
    setEditor({ kind, period, summary });
  };
  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || locked) return;
    const data = new FormData(event.currentTarget);
    const expectedVersion = editor.summary.version;
    try {
      let next: Confirmation;
      if (editor.kind === "metadata") {
        const raw = String(data.get("annualFee") ?? "").trim();
        const annualFee = raw ? parsePrice(raw, true) : null;
        if (raw && annualFee === null) throw new Error(m.annualInvalid);
        const ownerContact = String(data.get("ownerContact") ?? "").trim() || null;
        next = {
          version: expectedVersion,
          description: m.metadataConfirm(annualFee === null ? m.notSet : money(annualFee)),
          send: (signal) =>
            saveSubscription(
              restaurantId,
              { expectedVersion, ownerContact, defaultAnnualFeeCents: annualFee },
              signal,
            ),
        };
      } else if (editor.kind === "create" || editor.kind === "edit") {
        let period;
        try {
          period = periodFromForm(data, "period", editor.period?.id ?? randomUuid());
        } catch {
          throw new Error(m.periodInvalid);
        }
        next = {
          version: expectedVersion,
          description: m.periodConfirm(
            editor.kind === "create",
            period.startsOn,
            period.endsOn,
            period.years,
            money(period.amountCents),
            period.paidOn,
          ),
          send: (signal) =>
            editor.kind === "create"
              ? createPeriod(restaurantId, { ...period, expectedVersion }, signal)
              : editPeriod(
                  restaurantId,
                  period.id,
                  {
                    startsOn: period.startsOn,
                    endsOn: period.endsOn,
                    years: period.years,
                    amountCents: period.amountCents,
                    expectedVersion,
                  },
                  signal,
                ),
        };
      } else if (editor.kind === "expiry") {
        const endsOn = String(data.get("endsOn"));
        if (!endsOn || endsOn <= editor.period!.startsOn) throw new Error(m.endAfterStart);
        next = {
          version: expectedVersion,
          description: m.expiryConfirm(editor.period!.endsOn, endsOn),
          send: (signal) =>
            adjustExpiry(restaurantId, editor.period!.id, { expectedVersion, endsOn }, signal),
        };
      } else {
        const paidOn = String(data.get("paidOn"));
        if (!paidOn || paidOn > editor.summary.localToday) throw new Error(m.paidOnInvalid);
        next = {
          version: expectedVersion,
          description: m.paymentConfirm(
            editor.period!.startsOn,
            editor.period!.endsOn,
            money(editor.period!.amountCents),
            paidOn,
          ),
          send: (signal) =>
            confirmPayment(restaurantId, editor.period!.id, { expectedVersion, paidOn }, signal),
        };
      }
      setValidation("");
      setConfirmation(next);
    } catch (error) {
      setValidation(error instanceof Error ? error.message : m.checkInput);
    }
  };
  const commit = async () => {
    if (!confirmation || locked || confirmation.version !== summary?.version) return;
    const selected = confirmation;
    setConfirmation(null);
    if (await actions.run(selected.send)) setEditor(null);
  };
  return (
    <section
      className="my-6 space-y-5 rounded-2xl border bg-card p-4 shadow-xs sm:p-5"
      aria-label={m.region}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{m.title}</h2>
        <Button
          variant="outline"
          size="icon"
          aria-label={m.refresh}
          onClick={() => void detail.refetch()}
        >
          <RefreshCw className={cn(detail.isFetching && "animate-spin")} />
        </Button>
      </div>
      {detail.isPending && <LoadingState label={m.loading} />}
      {detail.error && (
        <Notice tone="error">{errorMessage(detail.error, undefined, language)}</Notice>
      )}
      {summary && (
        <div className="space-y-4">
          <SubscriptionStatus summary={summary} />
          <dl className="grid gap-x-4 gap-y-2 border-t pt-4 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">{m.ownerContact}</dt>
            <dd className="font-medium whitespace-pre-wrap wrap-break-word">
              {summary.ownerContact || m.notRegistered}
            </dd>
            <dt className="text-muted-foreground">{m.defaultFee}</dt>
            <dd className="font-medium">
              {summary.defaultAnnualFeeCents === null
                ? m.feeNotSet
                : money(summary.defaultAnnualFeeCents)}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button disabled={locked} onClick={() => open("create")}>
              {m.newPeriod}
            </Button>
            <Button variant="outline" disabled={locked} onClick={() => open("metadata")}>
              {m.editMetadata}
            </Button>
          </div>
          {detail.stale && (
            <p role="status" className="text-sm">
              {m.stale}
            </p>
          )}
        </div>
      )}
      {actions.message && <Notice>{actions.message}</Notice>}
      {editor && (
        <form
          key={`${editor.kind}:${editor.period?.id ?? "new"}:${editor.summary.version}`}
          onSubmit={submitEditor}
          className="space-y-4 rounded-xl border bg-background p-4"
        >
          <h3 className="font-semibold">{m.editor[editor.kind]}</h3>
          <fieldset disabled={actions.busy || !!confirmation} className="grid gap-4 sm:grid-cols-2">
            {editor.kind === "metadata" ? (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="subscription-contact">{m.ownerContact}</Label>
                  <Textarea
                    id="subscription-contact"
                    name="ownerContact"
                    maxLength={500}
                    defaultValue={editor.summary.ownerContact ?? ""}
                    rows={3}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="subscription-annual">{m.annualField}</Label>
                  <Input
                    id="subscription-annual"
                    name="annualFee"
                    inputMode="decimal"
                    defaultValue={
                      editor.summary.defaultAnnualFeeCents === null
                        ? ""
                        : formatCents(editor.summary.defaultAnnualFeeCents)
                    }
                  />
                </div>
              </>
            ) : editor.kind === "create" || editor.kind === "edit" ? (
              <PeriodFields
                key={`${editor.kind}:${editor.period?.id ?? "new"}`}
                prefix="period"
                annualFee={editor.summary.defaultAnnualFeeCents}
                today={editor.summary.localToday}
                startsOn={renewalStart(periods?.[0], editor.summary)}
                initial={editor.period}
                allowPaid={editor.kind === "create"}
              />
            ) : editor.kind === "expiry" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="subscription-end">{m.newEnd}</Label>
                <Input
                  id="subscription-end"
                  name="endsOn"
                  type="date"
                  required
                  defaultValue={editor.period!.endsOn}
                  min={editor.period!.startsOn}
                />
              </div>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <PeriodDetails period={editor.period!} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="subscription-paid">{m.paidOn}</Label>
                  <Input
                    id="subscription-paid"
                    name="paidOn"
                    type="date"
                    required
                    defaultValue={editor.summary.localToday}
                    max={editor.summary.localToday}
                  />
                </div>
              </>
            )}
            <Button type="submit" disabled={locked}>
              {m.checkContinue}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditor(null);
                setValidation("");
              }}
            >
              {m.cancelEdit}
            </Button>
          </fieldset>
          {editor.summary.version !== summary?.version && (
            <Notice tone="error">{m.editorStale}</Notice>
          )}
          {validation && <Notice tone="error">{validation}</Notice>}
        </form>
      )}
      {confirmation && (
        <section
          className="space-y-4 rounded-xl border border-primary/30 bg-accent/40 p-4"
          aria-label={m.confirmRegion}
        >
          <h3 className="font-semibold">{m.confirmTitle}</h3>
          <p className="text-sm leading-6">{confirmation.description}</p>
          {confirmation.version !== summary?.version && (
            <Notice tone="error">{m.versionChanged}</Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={locked || confirmation.version !== summary?.version}
              onClick={() => void commit()}
            >
              {m.confirm}
            </Button>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              {m.backToEdit}
            </Button>
          </div>
        </section>
      )}
      <h3 className="font-semibold">{m.periodsTitle}</h3>
      {periods?.length === 0 && <p className="text-sm text-muted-foreground">{m.noPeriods}</p>}
      {periods?.map((period) => (
        <article className="space-y-3 rounded-xl border p-4" key={period.id}>
          <PeriodDetails period={period} />
          <div className="flex flex-wrap gap-2">
            {!period.paidOn && (
              <>
                <Button disabled={locked} onClick={() => open("payment", period)}>
                  {m.confirmPaid}
                </Button>
                <Button variant="outline" disabled={locked} onClick={() => open("edit", period)}>
                  {m.editAgreement}
                </Button>
              </>
            )}
            <Button variant="outline" disabled={locked} onClick={() => open("expiry", period)}>
              {m.adjustExpiry}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
