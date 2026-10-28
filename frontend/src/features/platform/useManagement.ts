import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage, platformRequest, request } from "@/lib/api";
import { isPlatformQuery, isPrivateQuery } from "@/lib/query-scope";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { accountKey } from "@/features/accounts/queries";
import { platformKey } from "./identity";
import { managementMessages } from "./management-messages";
import {
  credentialsChanged,
  managementKey,
  readPending,
  recoveryUrl,
  type ManagedAccount,
  type RestaurantDetail,
  type PendingManagement,
  type TemporaryCredential,
} from "./state";

// Create returns both temporary passwords and a reset returns one; status and active changes return none.
function temporaryCredentials(result: unknown): TemporaryCredential[] {
  const value = result as { credentials?: TemporaryCredential[] } & Partial<TemporaryCredential>;
  if (value.credentials) return value.credentials;
  return value.account && value.temporaryPassword
    ? [{ account: value.account, temporaryPassword: value.temporaryPassword }]
    : [];
}

// Platform pages stay in Chinese; the OWNER's store page follows the staff language.
export function useManagement(scope: "platform" | "store", userId: string, restaurantId?: string) {
  const client = useQueryClient();
  const storeLanguage = useStaffLanguage();
  const language = scope === "platform" ? "zh" : storeLanguage;
  const m = managementMessages[language];
  const key = managementKey(scope, `${restaurantId ?? "platform"}:${userId}`);
  const [initial] = useState(() => {
    try {
      return { pending: readPending(sessionStorage.getItem(key)), damaged: false };
    } catch {
      return { pending: null, damaged: true };
    }
  });
  const damaged = initial.damaged;
  const [pending, setPending] = useState<PendingManagement | null>(initial.pending);
  const pendingRef = useRef<PendingManagement | null>(initial.pending);
  const [missingCreate, setMissingCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initial.damaged ? m.damaged : "");
  const [secrets, setSecrets] = useState<TemporaryCredential[]>([]);
  const epoch = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const sameIdentity = useCallback(() => {
    const identity = client.getQueryData<{ userId: string; restaurantId?: string }>(
      scope === "platform" ? platformKey : accountKey,
    );
    return (
      identity?.userId === userId &&
      (scope === "platform" || identity?.restaurantId === restaurantId)
    );
  }, [client, scope, userId, restaurantId]);
  const remember = useCallback(
    (p: PendingManagement | null) => {
      if (p) {
        const value = JSON.stringify(p);
        sessionStorage.setItem(key, value);
        if (sessionStorage.getItem(key) !== value) throw new Error("Storage unavailable");
      } else sessionStorage.removeItem(key);
      pendingRef.current = p;
      setPending(p);
      setMissingCreate(false);
    },
    [key],
  );
  const invalidate = useCallback(
    () =>
      client.invalidateQueries({
        predicate: scope === "platform" ? isPlatformQuery : isPrivateQuery,
      }),
    [client, scope],
  );

  const recover = useCallback(async () => {
    const p = pendingRef.current;
    if (!p || operation.current || !sameIdentity() || !isLive()) return;
    const controller = new AbortController();
    operation.current = controller;
    const generation = epoch.current;
    setBusy(true);
    try {
      const result = await (scope === "platform" ? platformRequest : request)<
        RestaurantDetail | ManagedAccount
      >(recoveryUrl(scope, p), { signal: controller.signal });
      if (controller.signal.aborted || generation !== epoch.current || !sameIdentity()) return;
      const feedback =
        p.kind === "reset" || p.kind === "active"
          ? m.recoveredAccount(
              credentialsChanged(
                p,
                "accounts" in result ? result.accounts.find((a) => a.id === p.userId) : result,
              ),
            )
          : p.kind === "create"
            ? m.recoveredCreate
            : m.recoveredRestaurant;
      remember(null);
      setMessage(feedback);
      await invalidate();
    } catch (error) {
      if (controller.signal.aborted || generation !== epoch.current || !sameIdentity()) return;
      if (error instanceof ApiError && error.status === 404 && p.kind === "create") {
        setMissingCreate(true);
        setMessage(m.missingCreate);
      } else setMessage(errorMessage(error, m.recoverUnknown, language));
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
      }
    }
  }, [scope, sameIdentity, remember, invalidate, m, language]);

  useEffect(() => {
    const cancel = () => {
      epoch.current++;
      operation.current?.abort();
      operation.current = null;
    };
    const lifecycle = () => {
      cancel();
      setBusy(false);
      setSecrets([]);
      void recover();
    };
    const initial = window.setTimeout(() => void recover(), 0);
    const timer = window.setInterval(() => void recover(), 15_000);
    const stopListening = onLifecycleChange(lifecycle);
    return () => {
      cancel();
      window.clearTimeout(initial);
      window.clearInterval(timer);
      stopListening();
    };
  }, [key, recover]);

  // The intent is stored before sending, so a lost result can be recovered by GET after a reload.
  const run = async (
    action: PendingManagement,
    send: (signal: AbortSignal) => Promise<unknown>,
  ) => {
    if (
      operation.current ||
      damaged ||
      !sameIdentity() ||
      !isLive() ||
      (pendingRef.current &&
        !(
          missingCreate &&
          pendingRef.current.kind === "create" &&
          action.restaurantId === pendingRef.current.restaurantId
        ))
    )
      return false;
    const wasUnknown = !!pendingRef.current;
    try {
      remember(action);
    } catch {
      setMessage(m.storageBlocked);
      return false;
    }
    const controller = new AbortController();
    operation.current = controller;
    const generation = epoch.current;
    setBusy(true);
    setSecrets([]);
    setMessage("");
    try {
      // Direct promises deliberately keep one-time credentials out of the mutation/query cache.
      const result = await send(controller.signal);
      if (controller.signal.aborted || generation !== epoch.current || !sameIdentity())
        return false;
      remember(null);
      setSecrets(temporaryCredentials(result));
      setMessage(m.done);
      await invalidate();
      return true;
    } catch (error) {
      if (controller.signal.aborted || generation !== epoch.current || !sameIdentity())
        return false;
      const definitive =
        !wasUnknown &&
        error instanceof ApiError &&
        error.status < 500 &&
        !["RESTAURANT_EXISTS", "CREATE_CONFLICT", "ACCOUNT_CHANGED"].includes(error.code);
      if (definitive) {
        try {
          remember(null);
        } catch {
          /* Keep recovery marker if storage is blocked. */
        }
      }
      setMessage(errorMessage(error, m.writeUnknown, language));
      return false;
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
      }
    }
  };
  return {
    run,
    recover,
    pending,
    missingCreate,
    busy,
    damaged,
    message,
    secrets,
    clearSecrets: () => setSecrets([]),
  };
}
