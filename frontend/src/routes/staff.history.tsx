import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/features/billing/HistoryPage";
import { historySearch } from "@/features/billing/state";

export const Route = createFileRoute("/staff/history")({ validateSearch: historySearch,
  component: function HistoryRoute() {
    const search = Route.useSearch(); const navigate = Route.useNavigate();
    return <HistoryPage search={search} navigate={next => void navigate({ search: next })} />;
  },
});
