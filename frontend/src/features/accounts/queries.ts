import { QueryClient, queryOptions } from "@tanstack/react-query";
import { isPrivateQuery } from "@/lib/query-scope";
import { getCurrentAccount, refreshCsrf, setAuthFailureHandler, type CurrentAccount } from "./api";

export const accountKey = ["auth", "me"] as const;
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 0, refetchOnWindowFocus: true, refetchOnReconnect: true },
    // Account writes must fail visibly while offline, not queue and replay on reconnect.
    mutations: { retry: false, networkMode: "always" },
  },
});

export const accountQuery = queryOptions({
  queryKey: accountKey,
  queryFn: async ({ signal }) => {
    const account = await getCurrentAccount(signal);
    const previous = queryClient.getQueryData<CurrentAccount | null>(accountKey);
    if (!account || previous?.userId !== account.userId || previous?.restaurantId !== account.restaurantId) {
      await clearPrivateQueries();
    }
    return account;
  },
});

const privateQueries = {
  predicate: isPrivateQuery,
};

async function clearPrivateQueries() {
  await queryClient.cancelQueries(privateQueries);
  queryClient.removeQueries(privateQueries);
}

export async function replaceAccount(account: CurrentAccount | null) {
  await queryClient.cancelQueries({ queryKey: accountKey });
  // Keep the observed identity query, replacing its value; remove all other private cached data.
  await clearPrivateQueries();
  for (const mutation of queryClient.getMutationCache().getAll()) {
    if (mutation.options.meta?.identityScope !== "guest") queryClient.getMutationCache().remove(mutation);
  }
  queryClient.setQueryData(accountKey, account);
}

export async function acceptAccount(account: CurrentAccount | null) {
  await replaceAccount(account);
  // The successful mutation remains successful even if this preparatory request loses connectivity.
  // The next write obtains a fresh token again.
  await refreshCsrf().catch(() => undefined);
}

setAuthFailureHandler(async (reason) => {
  const current = queryClient.getQueryData<CurrentAccount | null>(accountKey);
  await replaceAccount(reason === "password-required" && current
    ? { ...current, mustChangePassword: true } : null);
});
