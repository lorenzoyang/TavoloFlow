import {
  queryOptions,
  type FetchQueryOptions,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { isPrivateQuery } from "@/lib/query-scope";
import { getCurrentAccount, type CurrentAccount } from "./api";

export const accountKey = ["auth", "me"] as const;

export const accountQuery = queryOptions({
  queryKey: accountKey,
  queryFn: async ({ signal }) => {
    const account = await getCurrentAccount(signal);
    const previous = queryClient.getQueryData<CurrentAccount | null>(accountKey);
    if (
      !account ||
      previous?.userId !== account.userId ||
      previous?.restaurantId !== account.restaurantId
    ) {
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

// Keep the observed identity query, replacing its value; remove all other private cached data.
export async function replaceAccount(account: CurrentAccount | null) {
  await queryClient.cancelQueries({ queryKey: accountKey });
  await clearPrivateQueries();
  // Finished login and password-change mutations keep their variables, which contain passwords.
  queryClient.getMutationCache().clear();
  queryClient.setQueryData(accountKey, account);
}

// Registered in main.tsx: a rejected store credential signs out or forces the password change.
export async function handleStoreAuthFailure(reason: "signed-out" | "password-required") {
  const current = queryClient.getQueryData<CurrentAccount | null>(accountKey);
  await replaceAccount(
    reason === "password-required" && current ? { ...current, mustChangePassword: true } : null,
  );
}

// Whether a late result still belongs to the account a component was rendered for.
export function isSameAccount(
  client: QueryClient,
  account: Pick<CurrentAccount, "restaurantId" | "userId" | "role">,
) {
  const current = client.getQueryData<CurrentAccount | null>(accountKey);
  return (
    current?.userId === account.userId &&
    current.restaurantId === account.restaurantId &&
    current.role === account.role &&
    !current.mustChangePassword
  );
}

// After a successful write, replace the cached list with a read that starts after the write.
export async function refreshAfterWrite<TData, TKey extends QueryKey>(
  client: QueryClient,
  account: CurrentAccount,
  options: FetchQueryOptions<TData, Error, TData, TKey>,
): Promise<"refreshed" | "failed" | "stale"> {
  try {
    // A read started before the write must not become the post-save refresh.
    await client.cancelQueries({ queryKey: options.queryKey });
    if (!isSameAccount(client, account)) return "stale";
    await client.fetchQuery(options);
    return isSameAccount(client, account) ? "refreshed" : "stale";
  } catch {
    return isSameAccount(client, account) ? "failed" : "stale";
  }
}
