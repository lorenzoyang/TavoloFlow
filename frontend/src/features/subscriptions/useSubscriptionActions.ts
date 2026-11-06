import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { platformKey } from "@/features/platform/identity";
import { errorMessage } from "@/lib/api";
import { isPlatformQuery } from "@/lib/query-scope";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { platformSubscriptionMessages } from "./messages";

// Every write carries the subscription version the administrator confirmed, so a lost, repeated or
// late request applies at most once. An unknown result therefore needs no persisted marker: the view
// refreshes and the administrator re-confirms against the version it now shows.
export function useSubscriptionActions(userId: string) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = platformSubscriptionMessages[language];
  const sameIdentity = useCallback(
    () => client.getQueryData<{ userId: string }>(platformKey)?.userId === userId,
    [client, userId],
  );

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ops = useOperations();

  // Read through a ref so the lifecycle effect, registered once, shows the current language.
  const unknownResult = useRef(m.unknownResult);
  useEffect(() => {
    unknownResult.current = m.unknownResult;
  }, [m.unknownResult]);
  useEffect(
    () =>
      // Leaving the foreground or going offline abandons the response; the request may still apply.
      onLifecycleChange(() => {
        if (!ops.running()) return;
        ops.cancelAll();
        setBusy(false);
        setMessage(unknownResult.current);
      }),
    [ops],
  );

  const run = async (send: (signal: AbortSignal) => Promise<unknown>) => {
    if (!sameIdentity() || !isLive()) return false;
    const op = ops.start("subscription");
    if (!op) return false;
    const current = () => op.isCurrent() && sameIdentity();
    setBusy(true);
    setMessage("");
    try {
      await send(op.signal);
      if (!current()) return false;
      setMessage(m.done);
      return true;
    } catch (error) {
      if (!current()) return false;
      setMessage(errorMessage(error, m.unknownResult, language));
      return false;
    } finally {
      if (op.finish()) setBusy(false);
      // Success, rejection or unknown result alike: show what the server holds now.
      if (current()) await client.invalidateQueries({ predicate: isPlatformQuery });
    }
  };

  return { run, busy, message };
}
