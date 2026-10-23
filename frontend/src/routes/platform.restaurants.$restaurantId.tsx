import { createFileRoute } from "@tanstack/react-router";
import { RestaurantPage } from "@/features/platform/RestaurantPage";

export const Route = createFileRoute("/platform/restaurants/$restaurantId")({
  component: function RestaurantRoute() { return <RestaurantPage id={Route.useParams().restaurantId} />; },
});
