import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FloorPage } from "@/features/dining/FloorPage";
import { billingSearch } from "@/features/billing/state";

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
    const select = useCallback(
      (sessionId: string) => void navigate({ search: { sessionId: sessionId || undefined } }),
      [navigate],
    );
    const showOrder = useCallback(
      (sessionId: string, open: boolean) =>
        void navigate({
          search: { sessionId, mode: open ? "order" : undefined },
          replace: !open,
        }),
      [navigate],
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
