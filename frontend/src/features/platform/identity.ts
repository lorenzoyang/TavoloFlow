import { queryOptions } from "@tanstack/react-query";
import { ApiError, platformRequest, setPlatformAuthFailureHandler } from "@/lib/api";
import { isPlatformQuery } from "@/lib/query-scope";
import { queryClient } from "@/features/accounts/queries";

export type PlatformIdentity = { userId: string; username: string; role: "PLATFORM_ADMIN" };
export const platformKey = ["platform", "me"] as const;

async function clearPlatformData() {
  await queryClient.cancelQueries({ predicate: isPlatformQuery });
  queryClient.removeQueries({ predicate: isPlatformQuery });
}

export async function replacePlatform(account: PlatformIdentity | null) {
  await queryClient.cancelQueries({ queryKey: platformKey });
  await clearPlatformData();
  for (const mutation of queryClient.getMutationCache().getAll()) {
    if (mutation.options.meta?.identityScope === "platform") queryClient.getMutationCache().remove(mutation);
  }
  queryClient.setQueryData(platformKey, account);
}

export const platformQuery = queryOptions({
  queryKey: platformKey,
  queryFn: async ({ signal }) => {
    let account: PlatformIdentity | null;
    try { account = await platformRequest<PlatformIdentity>("/api/platform/auth/me", { signal }); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) account = null;
      else throw error;
    }
    const previous = queryClient.getQueryData<PlatformIdentity | null>(platformKey);
    if (!account || previous?.userId !== account.userId) await clearPlatformData();
    return account;
  },
});

setPlatformAuthFailureHandler(() => replacePlatform(null));
