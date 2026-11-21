import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ApiError, withTimeout } from "@/lib/api";
import { randomUuid } from "@/lib/ids";
import { isLive, useLiveActive } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import type { MenuItem } from "@/features/menu/api";
import {
  addItem,
  CartError,
  editLine,
  persistCart,
  refreshCart,
  type CartLine,
} from "@/features/orders/state";
import { freeDeliveryShortfall, normalizeCouponCode } from "@/features/online/state";
import {
  onlineMenuKey,
  onlineContextQuery,
  readCoupon,
  readDeliveryQuote,
  readOnlineMenu,
  readSubmission,
  submitOnlineRequest,
  type OnlineMenu,
  type OnlineStatus,
  type OnlineSubmission,
} from "./api";
import { onlineOrderError, type OnlineOrderMessage } from "./messages";
import { deviceStorage } from "./useRestaurantLanguage";
import {
  createOnlineIntent,
  currentQuote,
  deliveryShortfallCents,
  feeStatus,
  MAX_ADDRESS_LENGTH,
  emptyCheckoutForm,
  emptyOnlineCart,
  existingSubmission,
  onlineCartAmounts,
  onlineCartKey,
  quotedDeliveryTier,
  restoreOnlineCart,
  rememberOnlineOrder,
  submissionFailure,
  type CheckoutForm,
  type OnlineCart,
} from "./state";

// Why the checkout cannot continue when the restaurant is not taking orders.
const closedMessages: Record<Exclude<OnlineStatus, "OPEN">, OnlineOrderMessage> = {
  BUSY: "busy",
  PAUSED: "paused",
  CLOSED_HOURS: "closed",
  NOT_OFFERED: "notOffered",
  SUSPENDED: "suspended",
};

// The customer's online cart in this tab and the request it becomes. The full intent (request ID,
// fulfillment, name, phone, address, lines and coupon) is saved and read back before the POST, so a lost
// result is recovered by GET with that request ID, and only an explicit retry resends the same request.
// One request at a time.
export function useOnlineCart(slug: string, data: OnlineMenu) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const restaurantId = data.restaurant.id;
  const key = onlineCartKey(restaurantId);
  const [initial] = useState(() => {
    try {
      return { cart: restoreOnlineCart(sessionStorage.getItem(key), restaurantId), problem: null };
    } catch (e) {
      return {
        cart: emptyOnlineCart(restaurantId),
        problem: e instanceof CartError ? e.issue : ("storage" as const),
      };
    }
  });
  const [cart, setCart] = useState(initial.cart);
  const [blocked] = useState(initial.problem);
  const [message, setMessage] = useState<OnlineOrderMessage | null>(initial.problem);
  // The lines refreshed against the latest menu, shown with the checkout form until sent.
  const [review, setReview] = useState<OnlineCart | null>(null);
  const [form, setForm] = useState<CheckoutForm>(emptyCheckoutForm);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const current = useRef(cart);
  const live = useRef(data);
  useLayoutEffect(() => {
    live.current = data;
  }, [data]);
  const ops = useOperations();
  const active = useLiveActive();
  const contextOptions = onlineContextQuery(slug);
  const context = useQuery({
    ...contextOptions,
    enabled: active,
    refetchInterval: (query) => (active && query.state.data?.pending ? 10_000 : false),
    refetchIntervalInBackground: false,
  });
  const contextReady = !!context.data && !context.isError && !context.data.pending;
  const checkoutBlocked = !active || !contextReady;
  // Set for a moment after a delivery fee answer arrives, so a repeated tap on the button that asked
  // for it cannot place the order before the customer has seen the fee.
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);
  const tier = quotedDeliveryTier(form, data.restaurant.deliveryTiers);
  const amounts = onlineCartAmounts(cart, review, form, tier);
  // Delivery only: what the amount shown still lacks to reach the minimum. A new delivery order
  // cannot be sent while it is positive; the server checks again.
  const minOrderShortfall =
    form.fulfillment === "DELIVERY" && !cart.pending
      ? deliveryShortfallCents(amounts.totalCents, data.restaurant.deliveryMinOrderCents)
      : 0;
  // What checkout says about the delivery fee for the address now typed.
  const addressFee = feeStatus(form, data.restaurant.deliveryAutoQuote);
  const fee = addressFee === "QUOTED" && !tier ? "OUT_OF_RANGE" : addressFee;
  const waitingOrder = context.data?.pending;
  useEffect(() => {
    const storage = deviceStorage();
    if (waitingOrder && storage) rememberOnlineOrder(restaurantId, waitingOrder, storage);
  }, [restaurantId, waitingOrder]);

  const remember = useCallback(
    (next: OnlineCart, required = false) => {
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

  // Leaving the foreground or going offline abandons the request in flight; a pending intent stays
  // saved and is recovered by GET when the page is live again.
  const cancel = useCallback(() => {
    ops.cancelAll();
    setBusy(false);
  }, [ops]);
  useEffect(() => {
    const hidden = () => {
      if (!isLive()) cancel();
    };
    window.addEventListener("offline", hidden);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("offline", hidden);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [cancel]);

  function edit(change: (value: OnlineCart) => OnlineCart) {
    if (current.current.pending || ops.running()) return;
    try {
      const next = change(current.current);
      setMessage(null);
      setReview(null);
      remember(next);
    } catch (e) {
      setMessage(e instanceof CartError ? e.issue : "generic");
    }
  }

  function start(kind: "checkout" | "order") {
    if (ops.running()) return null;
    const op = ops.start(kind);
    if (!op) return null;
    setBusy(true);
    setMessage(null);
    return {
      signal: withTimeout(op.signal),
      active: op.isCurrent,
      finish: () => {
        if (op.finish()) setBusy(false);
      },
    };
  }

  // The order exists: forget the cart, remember the status link for this restaurant and open it.
  const success = useCallback(
    (result: OnlineSubmission) => {
      remember(emptyOnlineCart(restaurantId));
      setReview(null);
      const storage = deviceStorage();
      if (storage) rememberOnlineOrder(restaurantId, result, storage);
      void navigate({ to: "/o/$token", params: { token: result.statusToken } });
    },
    [remember, restaurantId, navigate],
  );

  const recover = useCallback(async () => {
    const pending = current.current.pending;
    if (!pending || !isLive() || ops.running()) return;
    const op = ops.start("order");
    if (!op) return;
    setBusy(true);
    try {
      const result = await readSubmission(slug, pending.clientRequestId, withTimeout(op.signal));
      if (op.isCurrent() && current.current.pending?.clientRequestId === pending.clientRequestId)
        success(result);
    } catch (e) {
      if (op.isCurrent()) setMessage(e instanceof ApiError ? onlineOrderError(e.code) : "offline");
    } finally {
      if (op.finish()) setBusy(false);
    }
  }, [ops, slug, success]);

  const pendingId = cart.pending?.clientRequestId;
  useEffect(() => {
    if (!pendingId) return;
    // Mount and later checks recover with GET only; polling never replays the POST.
    const timer = window.setTimeout(() => void recover(), 0);
    const interval = window.setInterval(() => void recover(), 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [pendingId, recover]);

  // Rereads the menu and its status, so the checkout shows current prices and the restaurant is open.
  async function checkout() {
    if (!isLive()) return;
    if (current.current.pending || !current.current.lines.length || blocked) return;
    const work = start("checkout");
    if (!work) return;
    try {
      const latestContext = await client.fetchQuery(contextOptions);
      if (!work.active()) return;
      if (latestContext.pending) {
        setMessage("browserPending");
        return;
      }
      const latest = await readOnlineMenu(slug, work.signal);
      if (!work.active()) return;
      client.setQueryData(onlineMenuKey(slug), latest);
      if (latest.status !== "OPEN") {
        setMessage(closedMessages[latest.status]);
        return;
      }
      const next = refreshCart(current.current, latest.menu.items, latest.menu.optionGroups);
      remember(next);
      setReview(next);
      setRequestId(randomUuid());
      // Delivery was turned off since the customer chose it: back to pickup, and say why.
      if (form.fulfillment === "DELIVERY" && !latest.restaurant.deliveryEnabled) {
        setForm({ ...form, fulfillment: "PICKUP" });
        setMessage("deliveryOff");
      }
      // The checkout is a page of its own, so the system back gesture returns to the menu.
      void navigate({ to: "/r/$slug/checkout", params: { slug } });
    } catch (e) {
      if (work.active())
        setMessage(
          e instanceof CartError
            ? e.issue
            : e instanceof ApiError
              ? onlineOrderError(e.code)
              : "offline",
        );
    } finally {
      work.finish();
    }
  }

  function back() {
    if (current.current.pending) return;
    // Closing during checkout preparation must not let a late response restore the review.
    if (ops.has("checkout")) cancel();
    setReview(null);
  }

  // Asks the restaurant whether a typed code works today before showing its discount; the order then
  // sends that percentage, which the server checks again.
  async function applyCoupon(text: string) {
    if (current.current.pending || !isLive()) return;
    const code = normalizeCouponCode(text);
    if (code === null) {
      setMessage("couponInvalid");
      return;
    }
    const work = start("checkout");
    if (!work) return;
    try {
      const coupon = await readCoupon(slug, code, work.signal);
      if (work.active()) setForm((value) => ({ ...value, coupon }));
    } catch (e) {
      if (work.active()) setMessage(e instanceof ApiError ? onlineOrderError(e.code) : "offline");
    } finally {
      work.finish();
    }
  }

  // Asks the server for the fee of the address as typed, only when the customer taps to calculate it,
  // so no address leaves for the map service unasked. It sends the trimmed text the order will send,
  // which the server binds the quote to, and the answer belongs to that text only: any change makes
  // it stale (currentQuote). A failed request counts as no automatic quote, so the price list shows
  // and the customer can ask again.
  async function lookupFee() {
    if (current.current.pending || !isLive() || !live.current.restaurant.deliveryAutoQuote) return;
    if (form.fulfillment !== "DELIVERY") return;
    const address = form.address.trim();
    if (!address || address.length > MAX_ADDRESS_LENGTH) return;
    const work = start("checkout");
    if (!work) return;
    const answer = (quote: Awaited<ReturnType<typeof readDeliveryQuote>>) => {
      setForm((value) =>
        value.address.trim() === address ? { ...value, quote: { ...quote, address } } : value,
      );
      setSettling(true);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => setSettling(false), 1000);
    };
    try {
      const quote = await readDeliveryQuote(slug, address, work.signal);
      if (work.active()) answer(quote);
    } catch {
      if (work.active())
        answer({
          result: "UNKNOWN",
          town: null,
          distanceMeters: null,
          feeCents: null,
          quote: null,
        });
    } finally {
      work.finish();
    }
  }

  async function send(retry: boolean, turnstileToken: string | null) {
    if (blocked || !isLive()) return;
    if (!retry && (checkoutBlocked || minOrderShortfall > 0)) return;
    // A delivery is placed only once its fee is known for this address, and never out of range.
    if (!retry && form.fulfillment === "DELIVERY" && (fee === "lookup" || fee === "OUT_OF_RANGE"))
      return;
    if ((!retry && (!review || current.current.pending)) || (retry && !current.current.pending))
      return;
    const work = start("order");
    if (!work) return;
    let sending = false;
    try {
      let pending = current.current.pending;
      if (retry && pending) {
        // A saved result is recoverable even while the verification provider is unavailable.
        try {
          const result = await readSubmission(slug, pending.clientRequestId, work.signal);
          if (work.active()) success(result);
          return;
        } catch (error) {
          if (!(
            error instanceof ApiError &&
            error.status === 404 &&
            error.code === "ONLINE_REQUEST_NOT_FOUND"
          ))
            throw error;
          if (!work.active()) return;
        }
      }
      if (live.current.turnstile && !turnstileToken) {
        setMessage("verificationRequired");
        return;
      }
      if (!retry) {
        if (!requestId) return;
        pending = createOnlineIntent(
          review!,
          form,
          requestId,
          amounts.deliveryFeeCents ?? undefined,
        );
        if (!remember({ ...review!, pending }, true)) return;
      }
      // A manual replay also needs durable storage; never silently rebuild a lost intent.
      if (retry && !remember(current.current, true)) return;
      sending = true;
      const result = await submitOnlineRequest(slug, pending!, work.signal, turnstileToken);
      if (work.active()) success(result);
    } catch (e) {
      if (!work.active()) return;
      const disposition = submissionFailure(
        e instanceof ApiError ? e.status : null,
        e instanceof ApiError ? e.code : null,
        retry,
      );
      // An understood rejection frees the cart for changes (see submissionFailure); anything else keeps it.
      if (sending && disposition === "editable") {
        remember({ ...current.current, pending: null });
        if (e instanceof ApiError && e.code === "ONLINE_PICKUP_SLOT_CHANGED")
          setRequestId(randomUuid());
        else setReview(null);
      }
      if (e instanceof ApiError && e.code === "ONLINE_BROWSER_PENDING") {
        const existing = existingSubmission(e.body.existingSubmission);
        // A background context read started before the conflict must not overwrite this result.
        await client.cancelQueries({ queryKey: contextOptions.queryKey });
        if (!work.active()) return;
        if (existing) {
          client.setQueryData(contextOptions.queryKey, { pending: existing });
        } else {
          void client.invalidateQueries({ queryKey: contextOptions.queryKey });
        }
      }
      // A lost or failed response leaves the intent pending, and its own notice already explains that
      // and offers the GET check, the retry and the phone. An understood rejection still says why.
      const lost = sending && !(e instanceof ApiError && e.status < 500);
      setMessage(
        lost
          ? null
          : e instanceof CartError
            ? e.issue
            : e instanceof ApiError
              ? onlineOrderError(e.code)
              : "offline",
      );
      // The menu carries the prices, the delivery switch and the minimum the server compared with.
      if (
        e instanceof ApiError &&
        [
          "MENU_CHANGED",
          "ONLINE_PICKUP_SLOT_CHANGED",
          "DELIVERY_NOT_OFFERED",
          "DELIVERY_MIN_ORDER",
          "DELIVERY_QUOTE_INVALID",
          "DELIVERY_FEE_CHANGED",
        ].includes(e.code)
      )
        void client.invalidateQueries({ queryKey: onlineMenuKey(slug) });
      // The quote expired or no longer matches: drop it, so checkout asks for a fresh one.
      if (e instanceof ApiError && e.code === "DELIVERY_QUOTE_INVALID")
        setForm((value) => ({ ...value, quote: null }));
      // The code no longer works: drop it, so the next checkout shows the full total.
      if (e instanceof ApiError && e.code === "COUPON_INVALID")
        setForm((value) => ({ ...value, coupon: null }));
    } finally {
      work.finish();
    }
  }

  return {
    verificationRequestId: cart.pending?.clientRequestId ?? requestId,
    waitingOrder: context.data?.pending ?? null,
    contextFailed: context.isError,
    contextChecking: !context.data && !context.isError,
    contextRefreshing: context.isFetching,
    live: active,
    contextReady,
    checkoutBlocked,
    settling,
    minOrderShortfall,
    freeDeliveryShortfall:
      tier && !cart.pending ? freeDeliveryShortfall(tier, amounts.totalCents) : 0,
    feeStatus: fee,
    quote: currentQuote(form),
    lookupFee,
    refreshContext: () => void context.refetch(),
    cart,
    amounts,
    busy,
    message,
    review,
    blocked,
    form,
    setForm,
    editPickupTime: (pickupTime?: string, fulfillment?: CheckoutForm["fulfillment"]) => {
      setForm((current) => ({
        ...current,
        pickupTime,
        fulfillment: fulfillment ?? current.fulfillment,
      }));
      setMessage((current) => (current === "pickupSlotChanged" ? null : current));
    },
    // A dish with option groups comes from the option picker with the customer's choice.
    add: (item: MenuItem, optionIds: string[] = []) =>
      edit((c) => addItem(c, item, live.current.menu.optionGroups, optionIds)),
    line: (index: number, patch: Partial<Pick<CartLine, "quantity" | "remark">>) =>
      edit((c) => editLine(c, index, patch)),
    checkout,
    applyCoupon,
    removeCoupon: () => {
      if (!current.current.pending) setForm((value) => ({ ...value, coupon: null }));
    },
    confirm: (token: string | null) => send(false, token),
    retry: (token: string | null) => send(true, token),
    recover,
    back,
  };
}
