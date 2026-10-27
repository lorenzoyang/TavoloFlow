import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, withTimeout } from "@/lib/api";
import { publicMenuKey, readBootstrap, type PublicMenu } from "@/features/public-menu/api";
import type { MenuItem } from "@/features/menu/api";
import { readGuestAccess } from "@/features/guests/api";
import type { useGuestVisit } from "@/features/guests/useGuestVisit";
import { accessOutcome } from "@/features/guests/state";
import { isLive } from "@/lib/useLiveView";
import { createOrder, ordersKey, readOrderByRequest, type Order } from "./api";
import { confirmedOrder } from "./response";
import { orderError, type OrderMessage } from "./messages";
import { randomUuid } from "@/lib/ids";
import {
  addItem,
  cartKey,
  CartError,
  createIntent,
  editLine,
  emptyCart,
  persistCart,
  refreshCart,
  restoreCart,
  submissionFailure,
  validateCart,
  type Cart,
  type CartLine,
  type OrderInput,
} from "./state";

type Guest = ReturnType<typeof useGuestVisit>;
type Review = { cart: Cart; sessionId: string; tableLabel: string; newVisit: boolean };

export function useCart(token: string, data: PublicMenu, guest: Guest, confirmedAt: number) {
  const client = useQueryClient();
  const key = cartKey(data.restaurant.id, data.table.id);
  const [initial] = useState(() => {
    const blank = emptyCart(data.restaurant.id, data.table.id, guest.visit.sessionId);
    try {
      return { cart: restoreCart(sessionStorage.getItem(key), blank), problem: null };
    } catch (e) {
      return { cart: blank, problem: e instanceof CartError ? e.issue : ("storage" as const) };
    }
  });
  const [cart, setCart] = useState(initial.cart);
  const [blocked, setBlocked] = useState(initial.problem);
  const [message, setMessage] = useState<OrderMessage | null>(initial.problem);
  const [review, setReview] = useState<Review | null>(null);
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef(cart);
  const live = useRef({ data, guest });
  useLayoutEffect(() => {
    live.current = { data, guest };
  }, [data, guest]);
  const operation = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const remember = useCallback(
    (next: Cart, required = false) => {
      try {
        if (blocked) throw new CartError(blocked);
        persistCart(sessionStorage, key, next);
      } catch (e) {
        setMessage(e instanceof CartError ? e.issue : "storage");
        if (required) return false;
      }
      current.current = next;
      setCart(next);
      return true;
    },
    [blocked, key],
  );

  const cancel = useCallback(() => {
    epoch.current++;
    operation.current?.abort();
    operation.current = null;
    setBusy(false);
    setReview(null);
    setReceipt(null);
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (!isLive()) cancel();
    };
    const channel =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("tavoloflow-guest") : null;
    if (channel) channel.onmessage = cancel;
    window.addEventListener("offline", hidden);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      // Cleanup must cancel the latest operation, not the operation present at effect setup.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++;
      operation.current?.abort();
      operation.current = null;
      channel?.close();
      window.removeEventListener("offline", hidden);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [cancel]);

  useEffect(() => {
    const saved = current.current;
    const oldVisit =
      confirmedAt > 0 && saved.sessionId !== null && saved.sessionId !== data.activeSessionId;
    if (!guest.visit.ended && !oldVisit) return;
    // Confirmed server lifecycle events erase this visit's draft and stop all recovery operations.
    cancel();
    if (saved.pending) setMessage("endedPending");
    current.current = emptyCart(data.restaurant.id, data.table.id, guest.visit.sessionId);
    setCart(current.current);
    try {
      sessionStorage.removeItem(key);
      setBlocked(null);
    } catch {
      setBlocked("storage");
    }
  }, [
    guest.visit.ended,
    guest.visit.sessionId,
    data.activeSessionId,
    data.restaurant.id,
    data.table.id,
    confirmedAt,
    key,
    cancel,
  ]);

  useEffect(() => {
    if (guest.verified) return;
    // Reauthentication retains only the local draft/intent, never protected responses or confirmation screens.
    cancel();
  }, [guest.verified, cancel]);

  function edit(change: (value: Cart) => Cart) {
    if (current.current.pending || operation.current) return;
    try {
      const next = change(current.current);
      setMessage(null);
      setReview(null);
      remember(next);
    } catch (e) {
      setMessage(e instanceof CartError ? e.issue : "generic");
    }
  }
  function start() {
    if (operation.current) return null;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setMessage(null);
    const generation = ++epoch.current;
    return {
      controller,
      signal: withTimeout(controller.signal),
      active: () => !controller.signal.aborted && generation === epoch.current,
    };
  }
  function finish(controller: AbortController) {
    if (operation.current === controller) {
      operation.current = null;
      setBusy(false);
    }
  }

  const success = useCallback(
    (order: Order, pending: OrderInput) => {
      confirmedOrder(order, pending.sessionId);
      remember(emptyCart(data.restaurant.id, data.table.id, pending.sessionId));
      setReceipt(order);
      setReview(null);
      setMessage("success");
      void client.invalidateQueries({
        queryKey: ordersKey(data.restaurant.id, data.table.id, pending.sessionId),
      });
    },
    [remember, data.restaurant.id, data.table.id, client],
  );

  const recover = useCallback(async () => {
    const pending = current.current.pending;
    const state = live.current;
    if (
      !pending ||
      operation.current ||
      state.guest.visit.ended ||
      !state.guest.verified ||
      !isLive()
    )
      return;
    const controller = new AbortController();
    operation.current = controller;
    const generation = ++epoch.current;
    const signal = withTimeout(controller.signal);
    setBusy(true);
    try {
      await readGuestAccess(pending.sessionId, signal);
      const result = await readOrderByRequest(pending.sessionId, pending.clientRequestId, signal);
      if (
        !controller.signal.aborted &&
        generation === epoch.current &&
        current.current.pending?.clientRequestId === pending.clientRequestId
      )
        success(confirmedOrder(result, pending.sessionId), pending);
    } catch (e) {
      if (!controller.signal.aborted && generation === epoch.current) {
        if (e instanceof ApiError && accessOutcome(e.code)) live.current.guest.invalidate(e.code);
        setMessage(e instanceof ApiError ? orderError(e.code) : "offline");
      }
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
      }
    }
  }, [success]);

  const pendingId = cart.pending?.clientRequestId;
  useEffect(() => {
    if (!pendingId || !guest.verified || guest.visit.ended) return;
    // Mount/reconnect/reauthentication recover with GET only. Polling never replays a write.
    const timer = window.setTimeout(() => void recover(), 0);
    const interval = window.setInterval(() => void recover(), 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [pendingId, guest.verified, guest.visit.ended, recover]);

  async function prepare() {
    if (current.current.pending || !current.current.lines.length || blocked || guest.visit.ended)
      return;
    if (!guest.verified) {
      guest.enter();
      setMessage("unverified");
      (
        document.getElementById("guest-join-code") ?? document.getElementById("guest-join-direct")
      )?.focus();
      return;
    }
    const work = start();
    if (!work) return;
    try {
      const latest = await readBootstrap(token, work.signal);
      if (!work.active()) return;
      client.setQueryData(publicMenuKey(token), latest);
      if (
        !latest.activeSessionId ||
        latest.activeSessionId !== live.current.guest.visit.sessionId
      ) {
        live.current.guest.invalidate("SESSION_CLOSED");
        return;
      }
      const access = await readGuestAccess(latest.activeSessionId, work.signal);
      if (!work.active()) return;
      if (access.serviceStatus !== "ACTIVE" || !access.isTableEnabled || !access.orderingEnabled) {
        setMessage(
          access.serviceStatus !== "ACTIVE"
            ? "suspended"
            : !access.isTableEnabled
              ? "disabled"
              : "paused",
        );
        return;
      }
      const next = refreshCart(current.current, latest.menu.items);
      remember(next);
      setReview({
        cart: next,
        sessionId: access.sessionId,
        tableLabel: latest.table.tableLabel,
        newVisit: next.sessionId === null,
      });
      setReceipt(null);
    } catch (e) {
      if (work.active()) {
        if (e instanceof ApiError && accessOutcome(e.code)) live.current.guest.invalidate(e.code);
        setMessage(
          e instanceof CartError ? e.issue : e instanceof ApiError ? orderError(e.code) : "offline",
        );
      }
    } finally {
      finish(work.controller);
    }
  }

  async function send(retry: boolean) {
    if (blocked || guest.visit.ended || !guest.verified || !isLive()) return;
    if ((!retry && (!review || current.current.pending)) || (retry && !current.current.pending))
      return;
    const work = start();
    if (!work) return;
    let pending: OrderInput | null = null;
    try {
      if (retry) pending = current.current.pending!;
      else {
        pending = createIntent(review!.cart, review!.sessionId, randomUuid());
        const frozen = { ...review!.cart, sessionId: pending.sessionId, pending };
        if (!remember(frozen, true)) return;
      }
      // Also verify durable storage before a manual replay; never silently reconstruct a lost intent.
      if (retry && !remember(current.current, true)) return;
      setReview(null);
      await readGuestAccess(pending.sessionId, work.signal);
      const result = await createOrder(pending, work.signal);
      if (work.active()) success(confirmedOrder(result, pending.sessionId), pending);
    } catch (e) {
      if (!work.active()) return;
      const disposition = submissionFailure(
        e instanceof ApiError ? e.status : null,
        e instanceof ApiError ? e.code : null,
        retry,
      );
      if (e instanceof ApiError && accessOutcome(e.code)) live.current.guest.invalidate(e.code);
      if (disposition === "editable" && pending) remember({ ...current.current, pending: null });
      setMessage(
        e instanceof CartError ? e.issue : e instanceof ApiError ? orderError(e.code) : "offline",
      );
      if (e instanceof ApiError && e.code === "MENU_CHANGED")
        void client.invalidateQueries({ queryKey: publicMenuKey(token) });
    } finally {
      finish(work.controller);
    }
  }

  return {
    cart,
    busy,
    message,
    review,
    receipt: guest.verified ? receipt : null,
    blocked,
    add: (item: MenuItem) => edit((c) => addItem(c, item)),
    line: (index: number, patch: Partial<Pick<CartLine, "quantity" | "remark">>) =>
      edit((c) => editLine(c, index, patch)),
    note: (orderNote: string) => edit((c) => validateCart({ ...c, orderNote })),
    prepare,
    confirm: () => send(false),
    retry: () => send(true),
    recover,
    back: () => setReview(null),
  };
}
