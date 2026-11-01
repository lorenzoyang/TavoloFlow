import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { useStaffOperation } from "@/features/accounts/useStaffOperation";
import { errorMessage } from "@/lib/api";
import { useLiveView } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { pickupSettingsQuery, savePickupHours, setPickupPaused, type PickupSettings } from "./api";
import { pickupMessages } from "./messages";
import type { PickupHour } from "./state";

export function usePickupSettings(account: CurrentAccount) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = pickupMessages[language];
  const view = useLiveView();
  const { restaurantId, userId } = account;
  const options = useMemo(
    () => pickupSettingsQuery({ restaurantId, userId }),
    [restaurantId, userId],
  );
  const settings = useQuery({ ...options, enabled: view.active });
  const operation = useStaffOperation(account, account.services.pickup);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void client.cancelQueries({ queryKey: options.queryKey }).then(() => {
      if (alive && view.active) void client.invalidateQueries({ queryKey: options.queryKey });
    });
    return () => {
      alive = false;
    };
  }, [client, options, view.active, view.resumeAfter]);

  async function save(send: (signal: AbortSignal) => Promise<PickupSettings>, message: string) {
    if (settings.isError) return false;
    const work = operation.start();
    if (!work) return false;
    setNotice("");
    setError("");
    try {
      await client.cancelQueries({ queryKey: options.queryKey });
      if (!work.current()) return false;
      const result = await send(work.signal);
      if (!work.current()) return false;
      // A poll may have started during the write. It must not replace the response with older settings.
      await client.cancelQueries({ queryKey: options.queryKey });
      if (!work.current()) return false;
      client.setQueryData(options.queryKey, result);
      setNotice(message);
      return true;
    } catch (error) {
      if (!work.current()) return false;
      setError(errorMessage(error, m.settingsUnknown, language));
      void client.invalidateQueries({ queryKey: options.queryKey });
      return false;
    } finally {
      work.finish();
    }
  }

  return {
    settings,
    view,
    busy: operation.busy,
    notice,
    error,
    togglePause: () => {
      if (!settings.data) return;
      const paused = !settings.data.paused;
      void save((signal) => setPickupPaused(paused, signal), m.pauseSaved(paused));
    },
    saveHours: (hours: PickupHour[]) =>
      save((signal) => savePickupHours(hours, signal), m.hoursSaved),
  };
}
