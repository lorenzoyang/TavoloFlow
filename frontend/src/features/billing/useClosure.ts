import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import { sessionKey } from "@/features/dining/api";
import { ApiError, errorMessage, request, withTimeout, write } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { staffMessages } from "@/lib/staff-messages";
import { invalidateStoreViews } from "@/lib/store-views";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import { usePendingMarkers } from "@/lib/usePendingMarkers";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { billingKey } from "./api";
import { billingMessages } from "./messages";
import {
  closureKey,
  closureRequest,
  readClosures,
  recoveryPath,
  type BillSummary,
  type Confirmation,
  type PendingClosure,
} from "./state";

const markerSession = (marker: PendingClosure) => marker.sessionId;

// Closes a visit's bill (PAID, VOIDED or EMPTY) and recovers a closure whose result was lost.
// A visit has at most one closure in flight or awaiting recovery, and recovery only reads the visit.
export function useClosure(account: CurrentAccount) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = billingMessages[language];
  const c = staffMessages[language];
  const scope = useMemo(() => billingKey(account), [account]);
  const sameIdentity = useCallback(() => isSameAccount(client, account), [account, client]);

  const [busy, setBusy] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<BillSummary | null>(null);

  const ops = useOperations();
  const markers = usePendingMarkers({
    storageKey: closureKey(account.restaurantId, account.userId),
    parse: readClosures,
    idOf: markerSession,
    recover,
  });
  const { recoverAll, discardStored } = markers;

  // A closed visit changes the floor, the table list and the kitchen queue as well as the bill.
  function refresh() {
    invalidateStoreViews(client, account, [
      "billing",
      "history",
      "floor",
      "dining",
      "tables",
      "kitchen",
    ]);
  }

  async function acceptSession(bill: BillSummary, valid: () => boolean) {
    await client.cancelQueries({ queryKey: scope });
    await client.cancelQueries({ queryKey: sessionKey(account, bill.sessionId) });
    if (!valid()) return;
    client.setQueryData(sessionKey(account, bill.sessionId), bill);
    if (bill.status === "CLOSED")
      client.removeQueries({ queryKey: [...scope, "active", bill.sessionId] });
    refresh();
  }

  useEffect(() => {
    const stop = onLifecycleChange(() => {
      // Results of work started before the change no longer apply; the pending markers stay.
      ops.cancelAll();
      setBusy([]);
      recoverAll();
    });
    return () => {
      stop();
      if (!sameIdentity()) discardStored();
    };
  }, [ops, recoverAll, discardStored, sameIdentity]);

  async function recover(action: PendingClosure) {
    if (!isLive() || !sameIdentity()) return;
    const op = ops.start(action.sessionId);
    if (!op) return;
    const current = () => op.isCurrent() && sameIdentity();
    setBusy((ids) => [...ids, action.sessionId]);
    try {
      const data = await request<BillSummary>(recoveryPath(action), {
        signal: withTimeout(op.signal),
      });
      if (!current()) return;
      await acceptSession(data, current);
      if (!current()) return;
      markers.remove(action.sessionId);
      setError("");
      setConflict(null);
      const table = c.table(data.tableLabel);
      setNotice(
        data.status === "CLOSED"
          ? m.recoveredClosed(
              table,
              m.close[data.closeReason!],
              formatMoney(data.totalAmountCents, language),
            )
          : m.recoveredActive(table),
      );
    } catch (e) {
      if (!current()) return;
      if (e instanceof ApiError && e.status === 404) {
        markers.remove(action.sessionId);
        setError(m.recoveredMissing);
      } else setError(errorMessage(e, m.recoverUnknown, language));
    } finally {
      if (op.finish()) setBusy((ids) => ids.filter((id) => id !== action.sessionId));
    }
  }

  async function close(confirmation: Confirmation) {
    const id = confirmation.bill.sessionId;
    if (!isLive() || !sameIdentity() || markers.has(id)) return false;
    const op = ops.start(id);
    if (!op) return false;
    const current = () => op.isCurrent() && sameIdentity();
    setBusy((ids) => [...ids, id]);
    markers.add({ sessionId: id, kind: confirmation.kind });
    setError("");
    setNotice("");
    setConflict(null);
    const intent = closureRequest(confirmation);
    try {
      const summary = await write<BillSummary>(
        intent.path,
        "POST",
        intent.body,
        withTimeout(op.signal),
      );
      if (!current()) return false;
      await acceptSession(summary, current);
      if (!current()) return false;
      markers.remove(id);
      setNotice(
        m.closedNotice(
          c.table(summary.tableLabel),
          m.close[confirmation.kind],
          formatMoney(summary.totalAmountCents, language),
        ),
      );
      return true;
    } catch (e) {
      if (!current()) return false;
      if (e instanceof ApiError && e.status < 500) {
        // A rejection is a definite answer: nothing was written, so nothing is left to recover.
        markers.remove(id);
        setError(errorMessage(e, undefined, language));
        setConflict((e.body.currentBill as BillSummary | undefined) ?? null);
        refresh();
      } else setError(m.writeUnknown);
      return false;
    } finally {
      if (op.finish()) setBusy((ids) => ids.filter((x) => x !== id));
    }
  }

  return {
    pending: markers.markers,
    storageWarning: markers.storageWarning,
    busy,
    notice,
    error,
    conflict,
    close,
    recover,
    clearFeedback: () => {
      setError("");
      setConflict(null);
      setNotice("");
    },
  };
}
