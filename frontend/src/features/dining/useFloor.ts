import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { ApiError, errorMessage, withTimeout } from "@/lib/api";
import { invalidateStoreViews } from "@/lib/store-views";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import {
  floorQuery,
  openTable,
  readFloor,
  readStaffJoinCode,
  sessionKey,
  sessionQuery,
  setAcceptingOrders,
  type CodeResult,
  type FloorTable,
} from "./api";
import { diningMessages } from "./messages";
import {
  parsePendingAction,
  pendingDiningKey,
  recoveredOpen,
  type PendingDiningAction,
} from "./state";

// The floor: the tables with their open visits, opening a table, the accepting-orders switch and the
// staff view of a visit's join code. The page runs one operation at a time. Opening and the switch are
// marked before their POST, so a lost result is checked by reading the floor again, never resent.
export function useFloor(account: CurrentAccount, selected: string, select: (id: string) => void) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = diningMessages[language];

  const floor = useQuery(floorQuery(account));
  const session = useQuery(sessionQuery(account, selected));

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const ops = useOperations();
  const storageKey = pendingDiningKey(account.restaurantId, account.userId);
  const [pending, setPending] = useState<PendingDiningAction | null>(() => {
    try {
      return parsePendingAction(sessionStorage.getItem(storageKey));
    } catch {
      return null;
    }
  });
  const remember = useCallback(
    (action: PendingDiningAction | null) => {
      setPending(action);
      try {
        if (action) sessionStorage.setItem(storageKey, JSON.stringify(action));
        else sessionStorage.removeItem(storageKey);
      } catch {
        /* GET recovery remains available. */
      }
    },
    [storageKey],
  );

  // The join code shows only while the page is live and the visit open. Hiding it moves the
  // generation on, so a code read still in flight is discarded without aborting anything else.
  const [code, setCode] = useState<CodeResult | null>(null);
  const codeGeneration = useRef(0);
  const hideCode = useCallback(() => {
    codeGeneration.current++;
    setCode(null);
  }, []);
  useEffect(() => onLifecycleChange(hideCode), [hideCode]);
  useEffect(() => {
    // A failed read or a closed visit withdraws the code for good (deriving it would bring it back once
    // the error clears), and discards a code read still in flight.
    // oxlint-disable-next-line react/set-state-in-effect
    if (floor.isError || session.isError || session.data?.status === "CLOSED") hideCode();
  }, [floor.isError, session.isError, session.data?.status, hideCode]);

  async function refresh() {
    await floor.refetch();
    if (selected) await session.refetch();
    invalidateStoreViews(client, account, ["tables"]);
  }

  const recover = useCallback(async () => {
    if (!pending) return;
    const op = ops.start("floor");
    if (!op) return;
    setBusy(true);
    setError("");
    setCode(null);
    try {
      // Both writes are checked on the floor: the switch's state, or the table's open visit.
      const data = await readFloor(op.signal);
      if (!op.isCurrent()) return;
      client.setQueryData(floorQuery(account).queryKey, data);
      if (pending.kind === "accepting") setNotice(m.checkedAccepting(data.orderingEnabled));
      else {
        const table = data.tables.find((t) => t.id === pending.tableId);
        const result = recoveredOpen(table?.session?.id);
        if (result.kind === "active") {
          select(result.sessionId);
          setNotice(m.foundVisit(data.joinCodeRequired));
        } else {
          select("");
          setNotice(table ? m.checkedFree : m.tableGone);
        }
      }
      remember(null);
    } catch (e) {
      if (op.isCurrent()) setError(errorMessage(e, m.recoverUnknown, language));
    } finally {
      if (op.finish()) setBusy(false);
    }
  }, [pending, ops, client, account, remember, select, m, language]);

  useEffect(() => {
    // Scheduled after mount, so StrictMode's setup/cleanup probe cannot cancel the only recovery.
    const initial = window.setTimeout(() => void recover(), 0);
    const stop = onLifecycleChange(() => {
      if (isLive()) void recover();
    });
    return () => {
      window.clearTimeout(initial);
      stop();
    };
  }, [recover]);

  async function open(table: FloorTable) {
    if (pending) return;
    const op = ops.start("floor");
    if (!op) return;
    const action: PendingDiningAction = { kind: "open", tableId: table.id };
    remember(action);
    setBusy(true);
    setError("");
    setNotice("");
    setCode(null);
    try {
      const result = await openTable(action.tableId, withTimeout(op.signal));
      if (!op.isCurrent()) return;
      select(result.session.sessionId);
      client.setQueryData(sessionKey(account, result.session.sessionId), result.session);
      if (result.joinCode && isLive())
        setCode({ sessionId: result.session.sessionId, joinCode: result.joinCode });
      setNotice(m.opened(!!result.joinCode));
      remember(null);
      void refresh();
    } catch (e) {
      if (!op.isCurrent()) return;
      if (e instanceof ApiError && e.status < 500) remember(null);
      setError(errorMessage(e, m.openUnknown, language));
      if (e instanceof ApiError && e.status === 409) void refresh();
    } finally {
      if (op.finish()) setBusy(false);
    }
  }

  async function toggleAccepting() {
    if (!floor.data || pending) return;
    const op = ops.start("floor");
    if (!op) return;
    const enabled = !floor.data.orderingEnabled;
    remember({ kind: "accepting", enabled });
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await setAcceptingOrders(enabled, withTimeout(op.signal));
      if (!op.isCurrent()) return;
      remember(null);
      setNotice(m.acceptingSaved(enabled));
      void refresh();
    } catch (e) {
      if (!op.isCurrent()) return;
      if (e instanceof ApiError && e.status < 500) remember(null);
      setError(errorMessage(e, m.acceptingUnknown, language));
    } finally {
      if (op.finish()) setBusy(false);
    }
  }

  async function viewCode() {
    if (!selected) return;
    const op = ops.start("floor");
    if (!op) return;
    const generation = ++codeGeneration.current;
    setBusy(true);
    setError("");
    try {
      const result = await readStaffJoinCode(selected, op.signal);
      if (op.isCurrent() && generation === codeGeneration.current && isLive()) setCode(result);
    } catch (e) {
      if (!op.isCurrent()) return;
      setCode(null);
      setError(errorMessage(e, undefined, language));
      void refresh();
    } finally {
      if (op.finish()) setBusy(false);
    }
  }

  return {
    floor,
    session,
    busy,
    pending,
    notice,
    error,
    code,
    refresh,
    recover,
    open,
    toggleAccepting,
    viewCode,
    // Selecting another table starts from a clean slate.
    clearFeedback: () => {
      setCode(null);
      setError("");
      setNotice("");
    },
  };
}
