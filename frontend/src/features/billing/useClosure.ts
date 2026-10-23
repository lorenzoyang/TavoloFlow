import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { accountKey } from "@/features/accounts/queries";
import { sessionKey } from "@/features/dining/api";
import { ApiError, errorMessage, request, write } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { billingKey, historyKey } from "./api";
import { isLive } from "@/lib/useLiveView";
import { canAcceptResult, closeLabels, closureKey, closureRequest, readClosures, recoveryPath,
  type BillSummary, type Confirmation, type PendingClosure } from "./state";

export function useClosure(account: CurrentAccount) {
  const client = useQueryClient();
  const key = closureKey(account.restaurantId, account.userId);
  const scope = useMemo(() => billingKey(account), [account]);
  const [pending, setPending] = useState<PendingClosure[]>(() => { try { return readClosures(sessionStorage.getItem(key)); } catch { return []; } });
  const pendingRef = useRef(pending);
  const [storageWarning, setStorageWarning] = useState(false);
  const [busy, setBusy] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<BillSummary | null>(null);
  const mounted = useRef(false); const epoch = useRef(0);
  const operations = useRef(new Map<string, AbortController>());
  const sameIdentity = useCallback(() => {
    const current = client.getQueryData<CurrentAccount | null>(accountKey);
    return current?.userId === account.userId && current.restaurantId === account.restaurantId && current.role === account.role;
  }, [account, client]);
  const remember = useCallback((next: PendingClosure[]) => {
    pendingRef.current = next; setPending(next);
    try { if (next.length) sessionStorage.setItem(key, JSON.stringify(next)); else sessionStorage.removeItem(key); }
    catch { setStorageWarning(true); }
  }, [key]);
  const forget = useCallback((id: string) => remember(pendingRef.current.filter(p => p.sessionId !== id)), [remember]);
  const refresh = useCallback(() => {
    for (const prefix of [scope, historyKey(account), ["floor", account.restaurantId, account.userId],
      ["dining", account.restaurantId, account.userId], ["tables", account.restaurantId, account.userId], ["kitchen", account.restaurantId, account.userId]])
      void client.invalidateQueries({ queryKey: prefix });
  }, [account, client, scope]);
  const acceptSession = useCallback(async (bill: BillSummary, valid: () => boolean) => {
    await client.cancelQueries({ queryKey: scope });
    await client.cancelQueries({ queryKey: sessionKey(account, bill.sessionId) });
    if (!valid()) return;
    client.setQueryData(sessionKey(account, bill.sessionId), bill);
    if (bill.status === "CLOSED") client.removeQueries({ queryKey: [...scope, "active", bill.sessionId] });
    refresh();
  }, [account, client, scope, refresh]);
  const recover = useCallback(async (action: PendingClosure) => {
    if (!isLive() || !sameIdentity() || operations.current.has(action.sessionId)) return;
    const controller = new AbortController(); operations.current.set(action.sessionId, controller);
    const generation = epoch.current;
    const current = () => canAcceptResult(mounted.current, generation, epoch.current, controller.signal.aborted, sameIdentity());
    setBusy(ids => [...ids, action.sessionId]);
    try {
      const data = await request<BillSummary>(recoveryPath(action), { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      if (!current()) return;
      await acceptSession(data, current);
      if (!current()) return;
      forget(action.sessionId); setError(""); setConflict(null);
      setNotice(data.status === "CLOSED"
        ? `${data.tableLabel} 桌已结束：${closeLabels[data.closeReason!]}，记录金额 ${formatMoney(data.totalAmountCents)}。请核对实际收款。`
        : `${data.tableLabel} 桌原用餐仍在进行，请重新核对账单后决定是否关闭。系统不会自动重新提交。`);
    } catch (e) {
      if (!current()) return;
      if (e instanceof ApiError && e.status === 404) { forget(action.sessionId); setError("原用餐记录已不可访问，请联系老板核对。不会对同桌下一轮执行关闭。"); }
      else setError(errorMessage(e, "关闭结果仍待确认，请恢复连接后核对原用餐。"));
    } finally {
      if (operations.current.get(action.sessionId) === controller) operations.current.delete(action.sessionId);
      if (mounted.current && generation === epoch.current) setBusy(ids => ids.filter(id => id !== action.sessionId));
    }
  }, [acceptSession, forget, sameIdentity]);
  const recoveryRef = useRef(recover);
  useEffect(() => { recoveryRef.current = recover; }, [recover]);
  useEffect(() => {
    mounted.current = true; const controllers = operations.current;
    const recoverPending = () => { if (isLive()) for (const action of pendingRef.current) void recoveryRef.current(action); };
    const lifecycle = () => { epoch.current++; controllers.forEach(c => c.abort()); controllers.clear(); setBusy([]); recoverPending(); };
    const timer = window.setInterval(recoverPending, 10_000); const initial = window.setTimeout(recoverPending, 0);
    window.addEventListener("online", lifecycle); window.addEventListener("offline", lifecycle); document.addEventListener("visibilitychange", lifecycle);
    return () => {
      // Invalidate every asynchronous continuation from this page/identity before unmounting.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      mounted.current = false; epoch.current++; controllers.forEach(c => c.abort()); controllers.clear();
      window.clearInterval(timer); window.clearTimeout(initial); window.removeEventListener("online", lifecycle);
      window.removeEventListener("offline", lifecycle); document.removeEventListener("visibilitychange", lifecycle);
      if (!sameIdentity()) { try { sessionStorage.removeItem(key); } catch { /* Identity scoped memory is discarded too. */ } }
    };
  }, [sameIdentity, key]);

  async function close(confirmation: Confirmation) {
    const id = confirmation.bill.sessionId;
    if (!isLive() || !sameIdentity() || operations.current.has(id) || pendingRef.current.some(p => p.sessionId === id)) return false;
    const controller = new AbortController(); operations.current.set(id, controller);
    const generation = epoch.current;
    const current = () => canAcceptResult(mounted.current, generation, epoch.current, controller.signal.aborted, sameIdentity());
    setBusy(ids => [...ids, id]); remember([...pendingRef.current, { sessionId: id, kind: confirmation.kind }]);
    setError(""); setNotice(""); setConflict(null);
    const intent = closureRequest(confirmation);
    try {
      const summary = await write<BillSummary>(intent.path, "POST", intent.body,
        AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]));
      if (!current()) return false;
      await acceptSession(summary, current);
      if (!current()) return false;
      forget(id); setNotice(`${summary.tableLabel} 桌已结束：${closeLabels[confirmation.kind]}，记录金额 ${formatMoney(summary.totalAmountCents)}。`);
      return true;
    } catch (e) {
      if (!current()) return false;
      if (e instanceof ApiError && e.status < 500) {
        forget(id); setError(errorMessage(e)); setConflict((e.body.currentBill as BillSummary | undefined) ?? null); refresh();
      } else setError("关闭结果待确认。请核对原用餐，系统不会自动重新提交。");
      return false;
    } finally {
      if (operations.current.get(id) === controller) operations.current.delete(id);
      if (mounted.current && generation === epoch.current) setBusy(ids => ids.filter(x => x !== id));
    }
  }
  return { pending, busy, notice, error, conflict, storageWarning, close, recover,
    clearFeedback: () => { setError(""); setConflict(null); setNotice(""); } };
}
