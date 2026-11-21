import { useRef, useState, type RefObject } from "react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { pickupMessages } from "@/features/online/pickup-messages";
import { formatPickupDate, formatPickupDateTime, formatTime } from "@/lib/format";
import type { Language } from "@/lib/language";
import type { PickupCalendar } from "./api";

export function PickupTimeField({
  calendar,
  date,
  time,
  stale,
  showMissing,
  busy,
  language,
  fieldRef,
  onChange,
}: {
  calendar: PickupCalendar | null;
  date?: string;
  time?: string;
  stale: boolean;
  showMissing: boolean;
  busy: boolean;
  language: Language;
  fieldRef: RefObject<HTMLFieldSetElement | null>;
  onChange: (selection: { date?: string; time?: string }) => void;
}) {
  const m = pickupMessages[language];
  const [editing, setEditing] = useState(false);
  const changeRef = useRef<HTMLButtonElement>(null);
  const days = calendar?.days ?? [];
  const day = days.find((day) => day.date === date) ?? days[0];
  const scheduled = date !== undefined || time !== undefined;
  const expanded = scheduled && (!time || stale || editing);
  const shownTime = time && m.selected(formatPickupDateTime(time, language));
  const today = calendar?.today;
  const tomorrow = today
    ? new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10)
    : undefined;
  const format = (time: string) => formatTime(time, language);

  return (
    <fieldset
      ref={fieldRef}
      tabIndex={-1}
      aria-invalid={stale || showMissing || undefined}
      aria-describedby={
        stale ? "online-pickup-problem" : showMissing ? "online-pickup-required" : undefined
      }
      className="space-y-3"
    >
      <legend id="online-pickup-time" className="mb-2 text-sm font-medium">
        {m.pickupTime}
      </legend>
      <RadioGroup
        aria-labelledby="online-pickup-time"
        className="grid-cols-2"
        value={scheduled ? "scheduled" : "asap"}
        disabled={busy}
        onValueChange={(value) => {
          setEditing(false);
          if (value === "asap") onChange({});
          else if (day) onChange({ date: day.date });
        }}
      >
        <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium has-data-checked:border-primary/40 has-data-checked:bg-accent">
          <RadioGroupItem value="asap" />
          {m.asap}
        </label>
        <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium has-data-checked:border-primary/40 has-data-checked:bg-accent has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50">
          <RadioGroupItem value="scheduled" disabled={!day && !scheduled} />
          {m.schedule}
        </label>
      </RadioGroup>
      {scheduled && shownTime && !expanded && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <p id="online-selected-pickup-time" className="text-sm font-medium">
              {shownTime}
            </p>
            <Button
              ref={changeRef}
              type="button"
              variant="outline"
              aria-describedby="online-selected-pickup-time"
              disabled={busy}
              onClick={() => {
                setEditing(true);
                requestAnimationFrame(() => fieldRef.current?.focus());
              }}
            >
              {m.change}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{m.confirmationHint}</p>
        </div>
      )}
      {stale && shownTime && <p className="text-sm text-muted-foreground">{shownTime}</p>}
      {!day && <Notice>{m.unavailable}</Notice>}
      {showMissing && (
        <Notice tone="error">
          <span id="online-pickup-required">{m.chooseTime}</span>
        </Notice>
      )}
      {expanded && day && (
        <div className="space-y-4 rounded-lg border bg-card p-3">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{m.date}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {days.map(({ date }) => {
                const { weekday, monthDay } = formatPickupDate(date, language);
                const label = date === today ? m.today : date === tomorrow ? m.tomorrow : weekday;
                return (
                  <Button
                    key={date}
                    type="button"
                    variant={date === day.date ? "default" : "outline"}
                    aria-pressed={date === day.date}
                    disabled={busy}
                    className="min-w-0 flex-col gap-0.5 px-1.5"
                    onClick={() => {
                      if (date !== day.date) onChange({ date });
                    }}
                  >
                    <span>{label}</span>
                    <span className="text-xs tabular-nums">{monthDay}</span>
                  </Button>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">{m.times}</legend>
            {day.periods.map((times) => (
              <div key={times[0]} className="space-y-2">
                {day.periods.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {format(times[0])}–{format(times[times.length - 1])}
                  </p>
                )}
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {times.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant={option === time ? "default" : "outline"}
                      aria-pressed={option === time}
                      disabled={busy}
                      className="min-w-0 px-1 tabular-nums"
                      onClick={() => {
                        onChange({ date: day.date, time: option });
                        setEditing(false);
                        requestAnimationFrame(() => changeRef.current?.focus());
                      }}
                    >
                      {format(option)}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        </div>
      )}
    </fieldset>
  );
}
