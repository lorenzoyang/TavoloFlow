import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/features/billing/BillingPage";
import { billingSearch } from "@/features/billing/state";

export const Route = createFileRoute("/staff/orders")({
  validateSearch: billingSearch,
  component: function OrdersRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <BillingPage
        sessionId={search.sessionId}
        select={(sessionId) => void navigate({ search: { sessionId } })}
      />
    );
  },
});
