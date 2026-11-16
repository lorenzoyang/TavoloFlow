import { createFileRoute } from "@tanstack/react-router";
import { NewRestaurantPage } from "@/features/platform/NewRestaurantPage";

export const Route = createFileRoute("/platform/restaurants/new")({ component: NewRestaurantPage });
