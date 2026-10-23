import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, withTimeout } from "@/lib/api";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { publicMenuKey, readBootstrap, type PublicMenu } from "@/features/public-menu/api";
import { guestKeys, joinVisit, readAccess, readGuestJoinCode } from "./api";
import { guestVisitKey, readVisit, reconcileVisit, accessOutcome, type GuestVisit } from "./state";
import { guestMessages } from "./messages";

export function useGuestVisit(
  token: string,
  data: PublicMenu,
  confirmedAt: number,
  menuError: boolean,
) {
  const client = useQueryClient();
  const [visit, setVisit] = useState<GuestVisit>(() => {
    try {
      return (
        readVisit(sessionStorage.getItem(guestVisitKey(token))) ?? {
          sessionId: data.activeSessionId,
          skipped: false,
          ended: false,
        }
      );
    } catch {
      return { sessionId: data.activeSessionId, skipped: false, ended: false };
    }
  });
  const [online, setOnline] = useState(() => navigator.onLine);
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const [verificationAfter, setVerificationAfter] = useState(0);
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof guestMessages.en | "">("");
  const [unknown, setUnknown] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const operation = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const key = guestKeys.access(data.restaurant.id, data.table.id, visit.sessionId);
  const access = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => readAccess(visit.sessionId!, signal),
    enabled: !!visit.sessionId && !visit.ended,
    refetchInterval: 30_000,
  });
  const clearCode = useCallback(() => {
    epoch.current++;
    setCode("");
  }, []);
  const remember = useCallback(
    (next: GuestVisit) => {
      setVisit(next);
      try {
        sessionStorage.setItem(guestVisitKey(token), JSON.stringify(next));
      } catch {
        /* Metadata is optional; server authorization is not. */
      }
    },
    [token],
  );
  const invalidate = useCallback(
    (errorCode: string) => {
      clearCode();
      const visitKey = guestKeys.visit(data.restaurant.id, data.table.id, visit.sessionId);
      void client.cancelQueries({ queryKey: visitKey });
      // Keep the visit's access entry (key position 4): it still drives which panel the page shows.
      client.removeQueries({ queryKey: visitKey, predicate: (q) => q.queryKey[4] !== "access" });
      if (accessOutcome(errorCode) === "ended") remember({ ...visit, ended: true });
      else if (accessOutcome(errorCode) === "unverified") {
        client.setQueryData(guestKeys.access(data.restaurant.id, data.table.id, visit.sessionId), {
          kind: "unverified",
        });
        remember({ ...visit, skipped: false });
      }
    },
    [clearCode, client, data.restaurant.id, data.table.id, visit, remember],
  );

  useEffect(() => {
    if (!confirmedAt) return;
    const next = reconcileVisit(visit, data.activeSessionId);
    // Synchronize the tab's lifecycle with a newly confirmed server snapshot.
    if (next !== visit) remember(next);
    else {
      try {
        sessionStorage.setItem(guestVisitKey(token), JSON.stringify(visit));
      } catch {
        /* Optional tab metadata. */
      }
    }
  }, [confirmedAt, data.activeSessionId, visit, remember, token]);

  useEffect(() => {
    // Authorization results are external events; immediately discard protected state.
    if (access.data?.kind === "ended" && !visit.ended) remember({ ...visit, ended: true });
    if (access.data?.kind !== "verified" || access.isError || access.isFetching || menuError)
      clearCode();
  }, [access.data, access.isError, access.isFetching, menuError, visit, remember, clearCode]);

  useEffect(() => {
    if (!access.data || access.data.kind === "verified") return;
    const protectedOrders = {
      queryKey: [...guestKeys.visit(data.restaurant.id, data.table.id, visit.sessionId), "orders"],
    };
    void client.cancelQueries(protectedOrders);
    client.removeQueries(protectedOrders);
  }, [access.data, data.restaurant.id, data.table.id, visit.sessionId, client]);

  useEffect(() => {
    // A changed/closed server session invalidates in-flight sensitive reads as well as local inputs.
    clearCode();
    setInput("");
    setError("");
    if (visit.ended) {
      operation.current?.abort();
      operation.current = null;
      setBusy(false);
      void client.cancelQueries({
        queryKey: guestKeys.visit(data.restaurant.id, data.table.id, visit.sessionId),
      });
      client.removeQueries({
        queryKey: guestKeys.visit(data.restaurant.id, data.table.id, visit.sessionId),
      });
    }
  }, [visit.sessionId, visit.ended, data.restaurant.id, data.table.id, client, clearCode]);

  useEffect(() => {
    const check = () => {
      setOnline(navigator.onLine);
      setVisible(document.visibilityState === "visible");
      clearCode();
      setVerificationAfter(Date.now());
      // Cancel old-identity requests before revalidating; their late responses must not repopulate protected queries.
      void client.cancelQueries({ queryKey: guestKeys.all }).then(() => {
        client.removeQueries({
          queryKey: guestKeys.all,
          predicate: (q) => q.queryKey[4] !== "access",
        });
        if (isLive()) void client.invalidateQueries({ queryKey: guestKeys.all });
      });
    };
    const stopListening = onLifecycleChange(check);
    const broadcast =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("tavoloflow-guest") : null;
    channel.current = broadcast;
    if (broadcast) broadcast.onmessage = check;
    return () => {
      // Cleanup intentionally cancels the latest operation, not the one present at mount.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++;
      operation.current?.abort();
      operation.current = null;
      broadcast?.close();
      stopListening();
    };
  }, [client, clearCode]);

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const verified =
    access.data?.kind === "verified" &&
    access.isFetchedAfterMount &&
    access.dataUpdatedAt >= verificationAfter &&
    !access.isError &&
    access.fetchStatus !== "paused" &&
    online &&
    visible &&
    !menuError &&
    !visit.ended;
  const entranceAllowed = data.restaurant.serviceStatus === "ACTIVE" && data.table.isEnabled;

  function finish(controller: AbortController) {
    // A cancelled operation must not clear a newer operation's busy state.
    if (operation.current === controller) {
      operation.current = null;
      setBusy(false);
    }
  }

  function showError(e: unknown) {
    if (!(e instanceof ApiError) || e.status >= 500) {
      setError("offline");
      return;
    }
    if (accessOutcome(e.code) === "ended") {
      remember({ ...visit, ended: true });
      return;
    }
    const messages: Record<string, keyof typeof guestMessages.en> = {
      JOIN_CODE_INCORRECT: "wrong",
      VALIDATION_FAILED: "invalid",
      RATE_LIMITED: "limited",
      CSRF_VALIDATION_FAILED: "csrf",
      GUEST_AUTH_REQUIRED: "expired",
      GUEST_SESSION_MISMATCH: "expired",
      SERVICE_SUSPENDED: "unavailable",
      TABLE_DISABLED: "unavailable",
    };
    setError(messages[e.code] ?? "unavailable");
    if (e.retryAfter) {
      setNow(Date.now());
      setRetryAt(Date.now() + e.retryAfter * 1000);
    }
  }

  async function join() {
    if (operation.current || !visit.sessionId || visit.ended) return;
    const controller = new AbortController();
    operation.current = controller;
    const generation = ++epoch.current;
    setBusy(true);
    setError("");
    setUnknown(false);
    setCode("");
    try {
      await joinVisit(token, visit.sessionId, input, withTimeout(controller.signal));
      if (controller.signal.aborted || generation !== epoch.current) return;
      setInput("");
      channel.current?.postMessage("changed");
      await client.cancelQueries({ queryKey: guestKeys.all });
      // Only the joined visit (key position 3) survives a new authorization in this browser.
      client.removeQueries({
        queryKey: guestKeys.all,
        predicate: (query) => query.queryKey[3] !== visit.sessionId,
      });
      await access.refetch();
    } catch (e) {
      if (controller.signal.aborted || generation !== epoch.current) return;
      if (!(e instanceof ApiError) || e.status >= 500) {
        setUnknown(true);
        await access.refetch();
      } else showError(e);
    } finally {
      finish(controller);
    }
  }

  async function reveal() {
    if (operation.current || !verified || !entranceAllowed || !visit.sessionId) return;
    const controller = new AbortController();
    operation.current = controller;
    const generation = ++epoch.current;
    setBusy(true);
    setError("");
    setCode("");
    try {
      const result = await readGuestJoinCode(visit.sessionId, withTimeout(controller.signal));
      if (
        !controller.signal.aborted &&
        generation === epoch.current &&
        result.sessionId === visit.sessionId &&
        isLive()
      )
        setCode(result.joinCode);
    } catch (e) {
      if (!controller.signal.aborted && generation === epoch.current) {
        showError(e);
        void access.refetch();
      }
    } finally {
      finish(controller);
    }
  }

  async function browse() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    clearCode();
    setUnknown(false);
    setError("");
    setBusy(true);
    try {
      // Explicit re-entry must use a fresh entrance, not the previous visit's cached bootstrap.
      const latest = await readBootstrap(token, withTimeout(controller.signal));
      if (controller.signal.aborted) return;
      await client.cancelQueries({ queryKey: guestKeys.table(data.restaurant.id, data.table.id) });
      client.removeQueries({ queryKey: guestKeys.table(data.restaurant.id, data.table.id) });
      client.setQueryData(publicMenuKey(token), latest);
      remember({ sessionId: latest.activeSessionId, skipped: false, ended: false });
    } catch (e) {
      if (!controller.signal.aborted) {
        if (e instanceof ApiError && e.code === "QR_NOT_FOUND")
          client.setQueryData(publicMenuKey(token), null);
        else showError(e);
      }
    } finally {
      finish(controller);
    }
  }

  return {
    visit,
    verified,
    checking: access.isPending && access.fetchStatus === "fetching",
    busy,
    code,
    input,
    setInput,
    error,
    unknown: unknown && !verified,
    stale: !online || menuError || access.isError || access.fetchStatus === "paused",
    entranceAllowed,
    wait: Math.max(0, Math.ceil((retryAt - now) / 1000)),
    visible,
    skip: () => remember({ ...visit, skipped: true }),
    enter: () => remember({ ...visit, skipped: false }),
    join,
    reveal,
    clearCode,
    browse,
    invalidate,
    retry: async () => {
      clearCode();
      await access.refetch();
      setUnknown(false);
    },
  };
}
