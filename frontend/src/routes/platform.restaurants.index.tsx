import { createFileRoute } from "@tanstack/react-router";
import { RestaurantsPage } from "@/features/platform/RestaurantsPage";
import { restaurantsSearch } from "@/features/platform/state";

export const Route = createFileRoute("/platform/restaurants/")({
  validateSearch: restaurantsSearch,
  component: function RestaurantsRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return <RestaurantsPage search={search} navigate={(next) => void navigate({ search: next })} />;
  },
});
