import { createFileRoute } from "@tanstack/react-router";
import { FloorPage } from "@/features/dining/FloorPage";
import { billingSearch } from "@/features/billing/state";

export const Route = createFileRoute("/staff/floor")({
  validateSearch: billingSearch,
  component: function FloorRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <FloorPage
        sessionId={search.sessionId}
        select={(sessionId) => void navigate({ search: { sessionId: sessionId || undefined } })}
      />
    );
  },
});
