import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ApiError, withTimeout } from "@/lib/api";
import { randomUuid } from "@/lib/ids";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import type { MenuItem } from "@/features/menu/api";
import {
  addItem,
  CartError,
  editLine,
  persistCart,
  pickupCartKey,
  refreshCart,
  type CartLine,
} from "@/features/orders/state";
import {
  onlineMenuKey,
  readOnlineMenu,
  readPickupByClientId,
  submitPickupRequest,
  type OnlineMenu,
  type PickupSubmission,
} from "./api";
import type { PickupMessage } from "./messages";
import {
  contactProblem,
  createPickupIntent,
  emptyPickupCart,
  pickupFailure,
  restorePickupCart,
  saveOrderToken,
  type PickupCart,
} from "./state";

type Message = { key: PickupMessage; until?: string };

const errorMessage = (error: ApiError): Message => {
  switch (error.code) {
    case "MENU_CHANGED":
      return { key: "changed" };
    case "PICKUP_NOT_OFFERED":
      return { key: "notOffered" };
    case "PICKUP_PAUSED":
      return { key: "paused" };
    case "PICKUP_CLOSED": {
      const until = error.body.nextOpensAt;
      return { key: "closed", until: typeof until === "string" ? until : undefined };
    }
    case "PICKUP_BUSY":
      return { key: "busyRestaurant" };
    case "SERVICE_SUSPENDED":
      return { key: "suspended" };
    case "MENU_LINK_NOT_FOUND":
      return { key: "invalidLink" };
    case "RATE_LIMITED":
      return { key: "limited" };
    case "CSRF_VALIDATION_FAILED":
      return { key: "csrf" };
    case "VALIDATION_FAILED":
      return {
        key: error.errors.customerName ? "name" : error.errors.customerPhone ? "phone" : "limits",
      };
    case "PICKUP_NOT_FOUND":
      return { key: "notFoundYet" };
    default:
      return { key: "generic" };
  }
};
const failure = (e: unknown): Message =>
  e instanceof CartError
    ? { key: e.issue }
    : e instanceof ApiError
      ? errorMessage(e)
      : { key: "offline" };

// The online pickup cart of one tab. Before a POST the whole request (id, contact and lines) is saved and
// read back; an unknown result recovers only by GET of the original id, and a manual retry resends that
// same request, so the restaurant never receives two.
export function usePickupCart(slug: string, data: OnlineMenu) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const restaurantId = data.restaurant.id;
  const key = pickupCartKey(restaurantId);
  const [initial] = useState(() => {
    const blank = emptyPickupCart(restaurantId);
    try {
      return { cart: restorePickupCart(sessionStorage.getItem(key), blank), problem: null };
    } catch (e) {
      // A damaged draft is dropped; unreadable storage blocks submitting, since the request could not be kept.
      if (e instanceof CartError && e.issue === "damaged") {
        try {
          sessionStorage.removeItem(key);
          return { cart: blank, problem: "damaged" as const };
        } catch {
          /* Fall through to blocked storage. */
        }
      }
      return { cart: blank, problem: "storage" as const };
    }
  });
  const [cart, setCart] = useState(initial.cart);
  const [blocked] = useState(initial.problem === "storage" ? initial.problem : null);
  const [message, setMessage] = useState<Message | null>(
    initial.problem ? { key: initial.problem } : null,
  );
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(initial.cart.pending?.customerName ?? "");
  const [phone, setPhone] = useState(initial.cart.pending?.customerPhone ?? "");
  const current = useRef(cart);
  const operation = useRef<AbortController | null>(null);
  const epoch = useRef(0);

  const remember = useCallback(
    (next: PickupCart, required = false) => {
      try {
        if (blocked) throw new CartError(blocked);
        persistCart(sessionStorage, key, next);
      } catch (e) {
        setMessage({ key: e instanceof CartError ? e.issue : "storage" });
        if (required) return false;
      }
      current.current = next;
      setCart(next);
      return true;
    },
    [blocked, key],
  );

  // Late responses are discarded when the page goes to the background, offline or away.
  useEffect(() => {
    const stop = onLifecycleChange(() => {
      if (isLive()) return;
      epoch.current++;
      operation.current?.abort();
      operation.current = null;
      setBusy(false);
    });
    return () => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++;
      operation.current?.abort();
      operation.current = null;
      stop();
    };
  }, []);

  function start() {
    if (operation.current) return null;
    const controller = new AbortController();
    operation.current = controller;
    const generation = ++epoch.current;
    setBusy(true);
    setMessage(null);
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
    (result: PickupSubmission) => {
      remember(emptyPickupCart(restaurantId));
      saveOrderToken(restaurantId, result.statusToken, localStorage);
      void navigate({ to: "/o/$token", params: { token: result.statusToken } });
    },
    [remember, restaurantId, navigate],
  );

  const recover = useCallback(async () => {
    const pending = current.current.pending;
    if (!pending || operation.current || !isLive()) return;
    const controller = new AbortController();
    operation.current = controller;
    const generation = ++epoch.current;
    setBusy(true);
    try {
      const result = await readPickupByClientId(
        slug,
        pending.clientRequestId,
        withTimeout(controller.signal),
      );
      if (
        !controller.signal.aborted &&
        generation === epoch.current &&
        current.current.pending?.clientRequestId === pending.clientRequestId
      )
        success(result);
    } catch (e) {
      if (!controller.signal.aborted && generation === epoch.current) setMessage(failure(e));
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
      }
    }
  }, [slug, success]);

  const pendingId = cart.pending?.clientRequestId;
  useEffect(() => {
    if (!pendingId) return;
    // Mount, reconnect and return to the foreground recover with GET only; nothing replays the POST.
    const timer = window.setTimeout(() => void recover(), 0);
    const interval = window.setInterval(() => void recover(), 30_000);
    const stop = onLifecycleChange(() => void recover());
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      stop();
    };
  }, [pendingId, recover]);

  function edit(change: (value: PickupCart) => PickupCart) {
    if (current.current.pending || operation.current) return;
    try {
      const next = change(current.current);
      setMessage(null);
      remember(next);
    } catch (e) {
      setMessage(failure(e));
    }
  }

  async function submit() {
    if (current.current.pending || !current.current.lines.length || blocked || !isLive()) return;
    const problem = contactProblem(name, phone);
    if (problem) {
      setMessage({ key: problem });
      return;
    }
    const work = start();
    if (!work) return;
    let frozen = false;
    try {
      // Check the restaurant still takes requests and the cart still matches the menu before freezing it.
      const latest = await readOnlineMenu(slug, work.signal);
      if (!work.active()) return;
      client.setQueryData(onlineMenuKey(slug), latest);
      if (latest.pickup.status !== "OPEN") {
        setMessage(
          latest.pickup.status === "CLOSED_HOURS"
            ? { key: "closed", until: latest.pickup.nextOpensAt ?? undefined }
            : {
                key:
                  latest.pickup.status === "PAUSED"
                    ? "paused"
                    : latest.pickup.status === "NOT_OFFERED"
                      ? "notOffered"
                      : "suspended",
              },
        );
        return;
      }
      const next = refreshCart(current.current, latest.menu.items);
      const pending = createPickupIntent(next, name, phone, randomUuid());
      if (!remember({ ...next, pending }, true)) return;
      frozen = true;
      const result = await submitPickupRequest(slug, pending, work.signal);
      if (work.active()) success(result);
    } catch (e) {
      if (!work.active()) return;
      if (
        frozen &&
        pickupFailure(
          e instanceof ApiError ? e.status : null,
          e instanceof ApiError ? e.code : null,
          false,
        ) === "editable"
      )
        remember({ ...current.current, pending: null });
      setMessage(failure(e));
      if (e instanceof ApiError && e.code === "MENU_CHANGED")
        void client.invalidateQueries({ queryKey: onlineMenuKey(slug) });
    } finally {
      finish(work.controller);
    }
  }

  // Resends the stored request unchanged with a fresh CSRF token; a rejection now never releases it.
  async function retry() {
    const pending = current.current.pending;
    if (!pending || blocked || !isLive()) return;
    const work = start();
    if (!work) return;
    try {
      if (!remember(current.current, true)) return;
      const result = await submitPickupRequest(slug, pending, work.signal);
      if (work.active()) success(result);
    } catch (e) {
      if (work.active()) setMessage(failure(e));
    } finally {
      finish(work.controller);
    }
  }

  const pending = !!cart.pending;
  return {
    cart,
    busy,
    blocked,
    message,
    name,
    phone,
    setName: (value: string) => !pending && setName(value),
    setPhone: (value: string) => !pending && setPhone(value),
    stage: pending ? ("pending" as const) : busy ? ("busy" as const) : ("editing" as const),
    add: (item: MenuItem) => edit((c) => addItem(c, item)),
    line: (index: number, patch: Partial<Pick<CartLine, "quantity" | "remark">>) =>
      edit((c) => editLine(c, index, patch)),
    submit,
    retry,
    recover,
  };
}
