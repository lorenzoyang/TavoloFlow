import { useCallback, useEffect, useRef } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { FloorPage } from "@/features/dining/FloorPage";
import { billingSearch } from "@/features/billing/state";

declare module "@tanstack/react-router" {
  interface HistoryState {
    staffOrderFromTable?: string;
  }
}

export const Route = createFileRoute("/staff/floor")({
  validateSearch: (search: Record<string, unknown>): { sessionId?: string; mode?: "order" } => {
    const { sessionId } = billingSearch(search);
    return {
      sessionId,
      mode: sessionId && search.mode === "order" ? ("order" as const) : undefined,
    };
  },
  component: function FloorRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    const router = useRouter();
    const returning = useRef(false);
    useEffect(() => {
      returning.current = false;
    }, [search.sessionId, search.mode]);
    const select = useCallback(
      (sessionId: string) => void navigate({ search: { sessionId: sessionId || undefined } }),
      [navigate],
    );
    const showOrder = useCallback(
      (sessionId: string, open: boolean) => {
        const location = router.history.location;
        const current = new URLSearchParams(location.search);
        if (current.get("sessionId") !== sessionId || (current.get("mode") === "order") === open)
          return;
        // Only an entry opened from this table is guaranteed to have its detail one step back.
        if (
          !open &&
          location.state.staffOrderFromTable === sessionId &&
          router.history.canGoBack()
        ) {
          if (returning.current) return;
          returning.current = true;
          router.history.back();
          return;
        }
        void navigate({
          search: { sessionId, mode: open ? "order" : undefined },
          state: open ? { staffOrderFromTable: sessionId } : {},
          replace: !open,
          resetScroll: false,
        });
      },
      [navigate, router],
    );
    return (
      <FloorPage
        sessionId={search.sessionId}
        ordering={search.mode === "order"}
        select={select}
        showOrder={showOrder}
      />
    );
  },
});
