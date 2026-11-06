import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, withTimeout } from "@/lib/api";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import { publicMenuKey, readBootstrap, type PublicMenu } from "@/features/public-menu/api";
import { guestKeys, joinVisit, readAccess, readGuestJoinCode } from "./api";
import { guestVisitKey, readVisit, reconcileVisit, accessOutcome, type GuestVisit } from "./state";
import { guestMessages } from "./messages";

// A guest's visit at one table: whether this tab may act for the open visit (verified), joining it
// with or without a code, revealing the code to share with the table, and browsing again after it ends.
// The tab runs one request at a time; access is rechecked on every lifecycle change and in other tabs.
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
  const codeRequired = data.restaurant.joinCodeRequired;

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
  const ops = useOperations();
  const channel = useRef<BroadcastChannel | null>(null);
  const autoJoined = useRef<string | null>(null);

  const key = guestKeys.access(data.restaurant.id, data.table.id, visit.sessionId);
  const access = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => readAccess(visit.sessionId!, signal),
    enabled: !!visit.sessionId && !visit.ended,
    refetchInterval: 30_000,
  });
  // Hides the join code and discards a code read in flight, without aborting a join.
  const clearCode = useCallback(() => {
    ops.invalidate();
    setCode("");
  }, [ops]);
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
      ops.cancelAll();
      setBusy(false);
      void client.cancelQueries({
        queryKey: guestKeys.visit(data.restaurant.id, data.table.id, visit.sessionId),
      });
      client.removeQueries({
        queryKey: guestKeys.visit(data.restaurant.id, data.table.id, visit.sessionId),
      });
    }
  }, [visit.sessionId, visit.ended, data.restaurant.id, data.table.id, client, clearCode, ops]);

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
  const autoJoin =
    !codeRequired &&
    !!visit.sessionId &&
    !visit.ended &&
    access.data?.kind === "unverified" &&
    !access.isFetching &&
    online &&
    visible &&
    !menuError &&
    entranceAllowed &&
    !busy;

  useEffect(() => {
    // Without join codes the page joins by itself, but at most once per visit: a failure leaves the
    // button, and two tabs at different tables never keep taking the browser's guest cookie back.
    if (!autoJoin || autoJoined.current === visit.sessionId) return;
    autoJoined.current = visit.sessionId;
    void join();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, visit.sessionId]);

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
    if (!visit.sessionId || visit.ended) return;
    const op = ops.start("visit");
    if (!op) return;
    setBusy(true);
    setError("");
    setUnknown(false);
    setCode("");
    try {
      await joinVisit(token, visit.sessionId, codeRequired ? input : null, withTimeout(op.signal));
      if (!op.isCurrent()) return;
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
      if (!op.isCurrent()) return;
      if (!(e instanceof ApiError) || e.status >= 500) {
        setUnknown(true);
        await access.refetch();
      } else {
        showError(e);
        // The platform may have just turned join codes on: reread the entrance to show the code field.
        if (!codeRequired) void client.invalidateQueries({ queryKey: publicMenuKey(token) });
      }
    } finally {
      if (op.finish()) setBusy(false);
    }
  }

  async function reveal() {
    if (!verified || !entranceAllowed || !visit.sessionId) return;
    const op = ops.start("visit");
    if (!op) return;
    setBusy(true);
    setError("");
    setCode("");
    try {
      const result = await readGuestJoinCode(visit.sessionId, withTimeout(op.signal));
      if (op.isCurrent() && result.sessionId === visit.sessionId && isLive())
        setCode(result.joinCode);
    } catch (e) {
      if (op.isCurrent()) {
        showError(e);
        void access.refetch();
      }
    } finally {
      if (op.finish()) setBusy(false);
    }
  }

  async function browse() {
    const op = ops.start("visit");
    if (!op) return;
    // Browsing hides the code itself, which invalidates this very operation: it therefore stops only
    // when aborted, not on the code invalidations that happen while it runs.
    clearCode();
    setUnknown(false);
    setError("");
    setBusy(true);
    try {
      // Explicit re-entry must use a fresh entrance, not the previous visit's cached bootstrap.
      const latest = await readBootstrap(token, withTimeout(op.signal));
      if (op.signal.aborted) return;
      await client.cancelQueries({ queryKey: guestKeys.table(data.restaurant.id, data.table.id) });
      client.removeQueries({ queryKey: guestKeys.table(data.restaurant.id, data.table.id) });
      client.setQueryData(publicMenuKey(token), latest);
      remember({ sessionId: latest.activeSessionId, skipped: false, ended: false });
    } catch (e) {
      if (!op.signal.aborted) {
        if (e instanceof ApiError && e.code === "QR_NOT_FOUND")
          client.setQueryData(publicMenuKey(token), null);
        else showError(e);
      }
    } finally {
      if (op.finish()) setBusy(false);
    }
  }

  return {
    visit,
    codeRequired,
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
