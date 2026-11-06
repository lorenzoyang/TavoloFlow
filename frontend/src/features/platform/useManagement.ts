import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage, platformRequest, request } from "@/lib/api";
import { isPlatformQuery, isPrivateQuery } from "@/lib/query-scope";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
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

// Restaurant and account administration writes (create, reset password, enable/disable, delete) for
// the platform pages and the OWNER's staff settings. One write runs at a time; its intent is stored
// before sending, so a lost result is checked by GET after a reload. Platform pages and the OWNER's
// store page share the device's interface language.
export function useManagement(scope: "platform" | "store", userId: string, restaurantId?: string) {
  const client = useQueryClient();
  const language = useStaffLanguage();
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
  const ops = useOperations();

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

  // After a delete nothing refetches here: the deleted restaurant's page would only read a 404.
  // The other pages refetch their stale queries when they mount.
  const invalidate = useCallback(
    (refetchType: "active" | "none" = "active") =>
      client.invalidateQueries({
        predicate: scope === "platform" ? isPlatformQuery : isPrivateQuery,
        refetchType,
      }),
    [client, scope],
  );

  const recover = useCallback(async () => {
    const p = pendingRef.current;
    if (!p || !sameIdentity() || !isLive()) return;
    const op = ops.start("management");
    if (!op) return;
    const current = () => op.isCurrent() && sameIdentity();
    setBusy(true);
    try {
      const result = await (scope === "platform" ? platformRequest : request)<
        RestaurantDetail | ManagedAccount
      >(recoveryUrl(scope, p), { signal: op.signal });
      if (!current()) return;
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
      if (!current()) return;
      if (error instanceof ApiError && error.status === 404 && p.kind === "create") {
        setMissingCreate(true);
        setMessage(m.missingCreate);
      } else if (error instanceof ApiError && error.status === 404) {
        // The target is gone (for a delete, this is its success); keeping the marker would block every write.
        remember(null);
        setMessage(m.recoveredMissing);
        await invalidate();
      } else setMessage(errorMessage(error, m.recoverUnknown, language));
    } finally {
      if (op.finish()) setBusy(false);
    }
  }, [scope, ops, sameIdentity, remember, invalidate, m, language]);

  useEffect(() => {
    const initial = window.setTimeout(() => void recover(), 0);
    const timer = window.setInterval(() => void recover(), 15_000);
    const stop = onLifecycleChange(() => {
      // A late result no longer applies, and one-time passwords leave the screen.
      ops.cancelAll();
      setBusy(false);
      setSecrets([]);
      void recover();
    });
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      stop();
    };
  }, [ops, recover]);

  // The intent is stored before sending, so a lost result can be recovered by GET after a reload.
  const run = async (
    action: PendingManagement,
    send: (signal: AbortSignal) => Promise<unknown>,
  ) => {
    if (
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
    const op = ops.start("management");
    if (!op) return false;
    const wasUnknown = !!pendingRef.current;
    try {
      remember(action);
    } catch {
      op.finish();
      setMessage(m.storageBlocked);
      return false;
    }
    const current = () => op.isCurrent() && sameIdentity();
    setBusy(true);
    setSecrets([]);
    setMessage("");
    try {
      // Direct promises deliberately keep one-time credentials out of the mutation/query cache.
      const result = await send(op.signal);
      if (!current()) return false;
      remember(null);
      setSecrets(temporaryCredentials(result ?? {}));
      setMessage(m.done);
      await invalidate(action.kind === "delete" ? "none" : "active");
      return true;
    } catch (error) {
      if (!current()) return false;
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
      if (op.finish()) setBusy(false);
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
