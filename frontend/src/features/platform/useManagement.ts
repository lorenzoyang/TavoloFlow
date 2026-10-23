import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage, platformRequest, platformWrite, request, write } from "@/lib/api";
import { isPlatformQuery, isPrivateQuery } from "@/lib/query-scope";
import { accountKey } from "@/features/accounts/queries";
import { platformKey } from "./identity";
import { accountRecoveryMessage, managementKey, readPending, recoveryUrl, type ManagedAccount, type RestaurantDetail, type PendingManagement, type TemporaryCredential } from "./state";

export function useManagement(scope: "platform" | "store", userId: string, restaurantId?: string) {
  const client = useQueryClient();
  const key = managementKey(scope, `${restaurantId ?? "platform"}:${userId}`);
  const [initial] = useState(() => {
    try { return { pending: readPending(sessionStorage.getItem(key)), damaged: false }; }
    catch { return { pending: null, damaged: true }; }
  });
  const damaged = initial.damaged;
  const [pending, setPending] = useState<PendingManagement | null>(initial.pending);
  const pendingRef = useRef<PendingManagement | null>(initial.pending);
  const [missingCreate, setMissingCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initial.damaged ? "待确认记录无法读取，请先联系管理员核对，当前页面暂停写入。" : "");
  const [secrets, setSecrets] = useState<TemporaryCredential[]>([]);
  const epoch = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const sameIdentity = useCallback(() => {
    const identity = client.getQueryData<{ userId: string; restaurantId?: string }>(scope === "platform" ? platformKey : accountKey);
    return identity?.userId === userId && (scope === "platform" || identity?.restaurantId === restaurantId);
  }, [client, scope, userId, restaurantId]);
  const remember = useCallback((p: PendingManagement | null) => {
    if (p) {
      const value = JSON.stringify(p);
      sessionStorage.setItem(key, value);
      if (sessionStorage.getItem(key) !== value) throw new Error("Storage unavailable");
    } else sessionStorage.removeItem(key);
    pendingRef.current = p; setPending(p); setMissingCreate(false);
  }, [key]);
  const invalidate = useCallback(() => client.invalidateQueries({ predicate: scope === "platform" ? isPlatformQuery : isPrivateQuery }), [client, scope]);

  const recover = useCallback(async () => {
    const p = pendingRef.current;
    if (!p || operation.current || !sameIdentity() || !navigator.onLine || document.visibilityState !== "visible") return;
    const controller = new AbortController(); operation.current = controller;
    const generation = epoch.current; setBusy(true);
    try {
      const result = await (scope === "platform" ? platformRequest : request)<RestaurantDetail | ManagedAccount>(recoveryUrl(scope, p), { signal: controller.signal });
      if (controller.signal.aborted || generation !== epoch.current || !sameIdentity()) return;
      const feedback = p.kind === "reset" || p.kind === "active"
        ? accountRecoveryMessage(p, "accounts" in result ? result.accounts.find(a => a.id === p.userId) : result)
        : p.kind === "create" ? "已查到餐厅。初始密码无法再次读取，请进入餐厅详情，核对后重新重置账号密码。"
        : "已重新读取餐厅状态，请核对。后续修改需要重新人工确认。";
      remember(null);
      setMessage(feedback);
      await invalidate();
    } catch (error) {
      if (controller.signal.aborted || generation !== epoch.current || !sameIdentity()) return;
      if (error instanceof ApiError && error.status === 404 && p.kind === "create") {
        setMissingCreate(true); setMessage("暂未查到原餐厅，旧请求仍可能到达。可重新填写并人工确认创建；系统会沿用原创建编号。");
      } else setMessage(errorMessage(error, "仍无法核对结果，请恢复网络后重新读取。"));
    } finally { if (operation.current === controller) { operation.current = null; setBusy(false); } }
  }, [scope, sameIdentity, remember, invalidate]);

  useEffect(() => {
    const cancel = () => { epoch.current++; operation.current?.abort(); operation.current = null; };
    const lifecycle = () => {
      cancel(); setBusy(false); setSecrets([]);
      void recover();
    };
    const initial = window.setTimeout(() => void recover(), 0);
    const timer = window.setInterval(() => void recover(), 15_000);
    document.addEventListener("visibilitychange", lifecycle); window.addEventListener("online", lifecycle); window.addEventListener("offline", lifecycle);
    return () => { cancel();
      window.clearTimeout(initial); window.clearInterval(timer);
      document.removeEventListener("visibilitychange", lifecycle); window.removeEventListener("online", lifecycle); window.removeEventListener("offline", lifecycle); };
  }, [key, recover]);

  const run = async (action: PendingManagement, path: string, method: "POST" | "PATCH", body: unknown) => {
    if (operation.current || damaged || !sameIdentity() || !navigator.onLine || document.visibilityState !== "visible" ||
      (pendingRef.current && !(missingCreate && pendingRef.current.kind === "create" && action.restaurantId === pendingRef.current.restaurantId))) return false;
    const wasUnknown = !!pendingRef.current;
    try { remember(action); } catch { setMessage("浏览器无法保存待确认标识，尚未发送修改。请允许此站点的标签页存储。"); return false; }
    const controller = new AbortController(); operation.current = controller;
    const generation = epoch.current; setBusy(true); setSecrets([]); setMessage("");
    try {
      // Direct promises deliberately keep one-time credentials out of the mutation/query cache.
      const result = await (scope === "platform" ? platformWrite : write)<{ credentials?: TemporaryCredential[] } & Partial<TemporaryCredential>>
        (path, method, body, controller.signal);
      if (controller.signal.aborted || generation !== epoch.current || !sameIdentity()) return false;
      remember(null);
      setSecrets(result.credentials ?? (result.account && result.temporaryPassword ? [{ account: result.account, temporaryPassword: result.temporaryPassword }] : []));
      setMessage("操作已完成，请核对当前状态。");
      await invalidate();
      return true;
    } catch (error) {
      if (controller.signal.aborted || generation !== epoch.current || !sameIdentity()) return false;
      const definitive = !wasUnknown && error instanceof ApiError && error.status < 500 &&
        !["RESTAURANT_EXISTS", "CREATE_CONFLICT", "ACCOUNT_CHANGED"].includes(error.code);
      if (definitive) { try { remember(null); } catch { /* Keep recovery marker if storage is blocked. */ } }
      setMessage(errorMessage(error, "操作结果待确认。恢复后只查询状态，不会自动重发修改。"));
      return false;
    } finally { if (operation.current === controller) { operation.current = null; setBusy(false); } }
  };
  return { run, recover, pending, missingCreate, busy, damaged, message, secrets, clearSecrets: () => setSecrets([]) };
}
