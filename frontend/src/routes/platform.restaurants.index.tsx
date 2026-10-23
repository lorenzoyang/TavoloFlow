import { createFileRoute } from "@tanstack/react-router";
import { RestaurantsPage } from "@/features/platform/RestaurantsPage";

export const Route = createFileRoute("/platform/restaurants/")({ component: RestaurantsPage });
