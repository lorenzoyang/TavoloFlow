import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { reveal } from "@/features/menu/form-values";
import { LANGUAGES } from "@/lib/language";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { saveDelivery } from "./api";
import { onlineMessages } from "./messages";
import { FreeDeliverySettings, type FreeDeliveryEdit } from "./FreeDeliverySettings";
import {
  deliveryDraft,
  deliveryInput,
  emptyTierDraft,
  MAX_DELIVERY_NOTE_LENGTH,
  MAX_DELIVERY_TIERS,
  originMapsUrl,
  parseOrigin,
  sameDelivery,
  type DeliveryDraft,
  type TierDraft,
} from "./state";
import type { SettingsCardProps } from "./settings-card";

export function DeliverySettingsCard({
  settings,
  busy,
  send,
  feedback,
  edited,
  saved,
}: SettingsCardProps & { saved: boolean }) {
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
