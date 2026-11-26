import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { savePickup, type OnlineSettings } from "./api";
import { pickupMessages } from "./pickup-messages";
import { onlineMessages } from "./messages";
import type { SettingsCardProps } from "./settings-card";

const pickupNoticeChoices = [30, 45, 60, 90, 120];

export function PickupSettingsCard({ settings, busy, send, feedback, edited }: SettingsCardProps) {
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
