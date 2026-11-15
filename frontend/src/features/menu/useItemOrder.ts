import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount, refreshAfterWrite } from "@/features/accounts/queries";
import { request, withTimeout } from "@/lib/api";
import { useOperations } from "@/lib/useOperations";
import { menuQuery, reorderItems, type Menu } from "./api";

// Drafts belong to the form. A failed save freezes them until an explicit GET resets the form;
// no write is retried, and a closed form or changed identity cannot consume a late result.
export function useItemOrder(account: CurrentAccount, setBusy: (busy: boolean) => void) {
  const client = useQueryClient();
  const operations = useOperations();
  const [error, setError] = useState<{ value: unknown; reading: boolean } | null>(null);
  const options = menuQuery(account);
  const active = () => isSameAccount(client, account);

  async function save(categoryId: string, itemIds: string[]) {
    if (error || !active()) return null;
    const operation = operations.start("item-order");
    if (!operation) return null;
    setBusy(true);
    try {
      await reorderItems(categoryId, itemIds, withTimeout(operation.signal));
      if (!operation.isCurrent() || !active()) return null;
      const result = await refreshAfterWrite(client, account, options);
      return operation.isCurrent() && active() && result !== "stale" ? result : null;
    } catch (value) {
      if (operation.isCurrent() && active()) setError({ value, reading: false });
      return null;
    } finally {
      if (operation.finish() && active()) setBusy(false);
    }
  }

  async function reload(): Promise<Menu | null> {
    if (!active()) return null;
    const operation = operations.start("item-order");
    if (!operation) return null;
    setBusy(true);
    try {
      await client.cancelQueries({ queryKey: options.queryKey });
      const menu = await request<Menu>("/api/staff/menu", {
        signal: withTimeout(operation.signal),
      });
      // Discard any background read started during this explicit read before replacing its cache.
      await client.cancelQueries({ queryKey: options.queryKey });
      if (!operation.isCurrent() || !active()) return null;
      client.setQueryData(options.queryKey, menu);
      setError(null);
      return menu;
    } catch (value) {
      if (operation.isCurrent() && active()) setError({ value, reading: true });
      return null;
    } finally {
      if (operation.finish() && active()) setBusy(false);
    }
  }

  return { error, save, reload };
}
