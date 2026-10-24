import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/lib/api";
import { isPlatformQuery } from "@/lib/query-scope";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { platformKey } from "@/features/platform/identity";

// Every write carries the subscription version the administrator confirmed, so a lost, repeated or
// late request applies at most once. An unknown result therefore needs no persisted marker: the view
// refreshes and the administrator re-confirms against the version it now shows.
const unknownResult =
  "操作结果未知，请核对刷新后的资料。修改只按确认时的版本生效，重新确认不会重复登记。";

export function useSubscriptionActions(userId: string) {
  const client = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sameIdentity = useCallback(
    () => client.getQueryData<{ userId: string }>(platformKey)?.userId === userId,
    [client, userId],
  );
  useEffect(() => {
    // Leaving the foreground or going offline abandons the response; the request may still apply.
    const stop = onLifecycleChange(() => {
      if (!controller.current) return;
      controller.current.abort();
      controller.current = null;
      setBusy(false);
      setMessage(unknownResult);
    });
    return () => {
      stop();
      controller.current?.abort();
      controller.current = null;
    };
  }, []);
  const run = async (send: (signal: AbortSignal) => Promise<unknown>) => {
    if (controller.current || !sameIdentity() || !isLive()) return false;
    const work = new AbortController();
    const current = () => !work.signal.aborted && sameIdentity();
    controller.current = work;
    setBusy(true);
    setMessage("");
    try {
      await send(work.signal);
      if (!current()) return false;
      setMessage("操作已完成。");
      return true;
    } catch (error) {
      if (!current()) return false;
      setMessage(errorMessage(error, unknownResult));
      return false;
    } finally {
      if (controller.current === work) {
        controller.current = null;
        setBusy(false);
      }
      // Success, rejection or unknown result alike: show what the server holds now.
      if (current()) await client.invalidateQueries({ predicate: isPlatformQuery });
    }
  };
  return { run, busy, message };
}
