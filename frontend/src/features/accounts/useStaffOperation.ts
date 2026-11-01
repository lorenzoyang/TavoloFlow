import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { withTimeout } from "@/lib/api";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import type { CurrentAccount } from "./api";
import { isSameAccount } from "./queries";

// One foreground write, bound to the account and this component's lifetime. Aborting never proves a
// write failed: callers refresh through GET, and only current() may publish its response or feedback.
export function useStaffOperation(account: CurrentAccount, enabled = true) {
  const client = useQueryClient();
  const { restaurantId, userId, role } = account;
  const scope = useMemo(() => ({ restaurantId, userId, role }), [restaurantId, userId, role]);
  const mounted = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const [active, setActive] = useState<{ scope: typeof scope; controller: AbortController } | null>(
    null,
  );
  useEffect(() => {
    mounted.current = true;
    const cancel = () => {
      operation.current?.abort();
      operation.current = null;
      if (mounted.current) setActive(null);
    };
    const stop = onLifecycleChange(() => {
      if (!isLive()) cancel();
    });
    return () => {
      mounted.current = false;
      cancel();
      stop();
    };
  }, [scope, enabled]);

  const start = useCallback(() => {
    if (
      !enabled ||
      !mounted.current ||
      operation.current ||
      !isLive() ||
      !isSameAccount(client, scope)
    )
      return null;
    const controller = new AbortController();
    operation.current = controller;
    setActive({ scope, controller });
    return {
      signal: withTimeout(controller.signal),
      current: () =>
        mounted.current &&
        operation.current === controller &&
        !controller.signal.aborted &&
        isLive() &&
        isSameAccount(client, scope),
      finish: () => {
        if (operation.current !== controller) return;
        operation.current = null;
        if (mounted.current) setActive(null);
      },
    };
  }, [client, scope, enabled]);
  return { busy: enabled && active?.scope === scope && !active.controller.signal.aborted, start };
}
