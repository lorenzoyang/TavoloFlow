import { useState, type FormEvent } from "react";
import { Copy, Plus, X } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { saveOnlineHours } from "./api";
import { onlineMessages } from "./messages";
import { copyDay, sameHours, WEEKDAYS, weekDraft, weekHours, type WeekDraft } from "./state";
import type { SettingsCardProps } from "./settings-card";

export function HoursSettingsCard({ settings, busy, send, feedback, edited }: SettingsCardProps) {
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
