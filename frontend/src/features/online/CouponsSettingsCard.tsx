import { useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { createCoupon, deleteCoupon } from "./api";
import { onlineMessages } from "./messages";
import {
  couponInput,
  emptyCouponDraft,
  type CouponDraft,
  type CouponProblem,
  type OnlineCoupon,
} from "./state";
import type { SettingsCardProps } from "./settings-card";

// OWNER: coupon codes for online orders. They are created and deleted, never edited, so a create sends
// its whole target and a repeat meets COUPON_CODE_TAKEN; deleting needs a human confirmation.
export function CouponsSettingsCard({ settings, busy, send, feedback, edited }: SettingsCardProps) {
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
