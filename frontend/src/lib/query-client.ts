import { QueryClient } from "@tanstack/react-query";

// One cache for all request identities; query-scope.ts decides which entries belong to which identity.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 0, refetchOnWindowFocus: true, refetchOnReconnect: true },
    // Writes must fail visibly while offline, not queue and replay on reconnect.
    mutations: { retry: false, networkMode: "always" },
  },
});
