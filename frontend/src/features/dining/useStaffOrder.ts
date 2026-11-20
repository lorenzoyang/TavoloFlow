import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { menuQuery, type Menu, type MenuItem } from "@/features/menu/api";
import { orderMessages } from "@/features/orders/messages";
import {
  addItem,
  CartError,
  createIntent,
  editLine,
  emptyCart,
  persistCart,
  refreshCart,
  restoreCart,
  submissionFailure,
  type Cart,
  type CartLine,
} from "@/features/orders/state";
import { ApiError, errorMessage, withTimeout } from "@/lib/api";
import { randomUuid } from "@/lib/ids";
import { invalidateStoreViews } from "@/lib/store-views";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { placeStaffOrder, readStaffOrderByRequest } from "./api";
import { staffOrderMessages } from "./staff-order-messages";

export function useStaffOrder({
  account,
  tableId,
  sessionId,
  canSubmit,
  onDone,
}: {
  account: CurrentAccount;
  tableId: string;
  sessionId: string;
  canSubmit: boolean;
  onDone: () => void;
}) {
  const client = useQueryClient();
  const ops = useOperations();
  const language = useStaffLanguage();
  const m = staffOrderMessages[language];
  const key = `tavoloflow:staff-order:${account.restaurantId}:${account.userId}:${sessionId}`;
  const [initial] = useState(() => {
    const blank = emptyCart(account.restaurantId, tableId, sessionId);
    try {
      const cart = restoreCart(sessionStorage.getItem(key), blank);
      if (cart.sessionId !== sessionId) throw new CartError("damaged");
      return { cart, problem: null };
    } catch (e) {
      return {
        cart: blank,
        problem: e instanceof CartError ? ("damaged" as const) : ("storage" as const),
      };
    }
  });
  const [cart, setCart] = useState(initial.cart);
  const current = useRef(cart);
  const [review, setReview] = useState<Cart | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(initial.problem ? m[initial.problem] : "");
  const [notFound, setNotFound] = useState(false);
  const [ended, setEnded] = useState(false);

  const remember = useCallback(
    (next: Cart, required = false) => {
      try {
        persistCart(sessionStorage, key, next);
      } catch {
        if (required) throw new CartError("storage");
      }
      current.current = next;
      setCart(next);
    },
    [key],
  );

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // A surviving intent can still be checked by its original request ID.
    }
    const blank = emptyCart(account.restaurantId, tableId, sessionId);
    current.current = blank;
    setCart(blank);
    setReview(null);
  }, [account.restaurantId, key, sessionId, tableId]);

  const finishOrder = useCallback(() => {
    clear();
    invalidateStoreViews(client, account, ["floor", "dining", "billing", "kitchen"]);
    onDone();
  }, [clear, client, account, onDone]);

  const closeVisit = useCallback(() => {
    clear();
    setEnded(true);
    setFeedback(m.ended);
    invalidateStoreViews(client, account, ["floor", "dining", "billing"]);
  }, [clear, m, client, account]);

  const recover = useCallback(async () => {
    const intent = current.current.pending;
    if (!intent || !isLive()) return;
    const op = ops.start("staff-order");
    if (!op) return;
    setBusy(true);
    setFeedback("");
    try {
      await readStaffOrderByRequest(intent, withTimeout(op.signal));
      if (op.isCurrent()) finishOrder();
    } catch (e) {
      if (!op.isCurrent()) return;
      const code = e instanceof ApiError ? e.code : null;
      if (code === "SESSION_CLOSED" || code === "SESSION_NOT_FOUND") closeVisit();
      else if (code === "ORDER_NOT_FOUND") setNotFound(true);
      else if (e instanceof ApiError && e.status < 500)
        setFeedback(errorMessage(e, undefined, language));
    } finally {
      if (op.finish()) setBusy(false);
    }
  }, [ops, finishOrder, closeVisit, language]);

  const pendingId = cart.pending?.clientRequestId;
  useEffect(() => {
    const stop = onLifecycleChange(() => {
      if (isLive()) void recover();
      else {
        ops.cancelAll();
        setBusy(false);
      }
    });
    const initialCheck = window.setTimeout(() => void recover(), 0);
    const poll = pendingId ? window.setInterval(() => void recover(), 30_000) : undefined;
    return () => {
      stop();
      window.clearTimeout(initialCheck);
      window.clearInterval(poll);
    };
  }, [ops, recover, pendingId]);

  function edit(change: (draft: Cart) => Cart) {
    if (ops.running() || current.current.pending || ended) return;
    try {
      remember(change(current.current));
      setFeedback("");
    } catch (e) {
      setFeedback(e instanceof CartError ? orderMessages[language][e.issue] : m.changed);
    }
  }

  async function prepare() {
    if (
      !canSubmit ||
      ended ||
      !isLive() ||
      current.current.pending ||
      !current.current.lines.length
    )
      return;
    const op = ops.start("staff-order");
    if (!op) return;
    setBusy(true);
    setFeedback("");
    try {
      const menu = await client.fetchQuery({ ...menuQuery(account), staleTime: 0 });
      if (!op.isCurrent()) return;
      const draft = refreshCart(current.current, menu.items, menu.optionGroups);
      remember(draft);
      setReview(draft);
    } catch (e) {
      if (op.isCurrent())
        setFeedback(e instanceof CartError ? m.changed : errorMessage(e, m.menuError, language));
    } finally {
      if (op.finish()) setBusy(false);
    }
  }

  async function send(retry: boolean) {
    if (!canSubmit || ended || !isLive()) return;
    const draft = current.current;
    const frozen = retry ? draft : review;
    if (!frozen || (retry ? !draft.pending || !notFound : draft.pending)) return;
    const op = ops.start("staff-order");
    if (!op) return;
    setBusy(true);
    setFeedback("");
    try {
      const intent = frozen.pending ?? createIntent(frozen, sessionId, randomUuid());
      // Reuse the frozen request across reload and retry, even if the menu has since changed.
      remember({ ...frozen, pending: intent }, true);
      setReview(null);
      setNotFound(false);
      await placeStaffOrder(intent, withTimeout(op.signal));
      if (op.isCurrent()) finishOrder();
    } catch (e) {
      if (!op.isCurrent()) return;
      if (e instanceof CartError) {
        setReview(null);
        setFeedback(e.issue === "storage" ? m.storage : m.changed);
        return;
      }
      const code = e instanceof ApiError ? e.code : null;
      const failure = submissionFailure(e instanceof ApiError ? e.status : null, code, retry);
      if (failure === "ended") closeVisit();
      else {
        if (failure === "editable") remember({ ...current.current, pending: null });
        if (code === "MENU_CHANGED") setFeedback(m.changed);
        else if (e instanceof ApiError && e.status < 500)
          setFeedback(errorMessage(e, undefined, language));
      }
      if (code === "MENU_CHANGED")
        void client.invalidateQueries({ queryKey: menuQuery(account).queryKey });
    } finally {
      if (op.finish()) setBusy(false);
    }
  }

  return {
    cart,
    review,
    busy,
    feedback,
    notFound,
    ended,
    add: (item: MenuItem, menu: Menu, options: string[] = []) =>
      edit((draft) => addItem(draft, item, menu.optionGroups, options)),
    line: (index: number, patch: Partial<Pick<CartLine, "quantity" | "remark">>) =>
      edit((draft) => editLine(draft, index, patch)),
    prepare,
    recover,
    confirm: () => send(false),
    retry: () => send(true),
    dismissReview: () => setReview(null),
  };
}
