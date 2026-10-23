import { createFileRoute } from "@tanstack/react-router";
import { KitchenPage } from "@/features/kitchen/KitchenPage";

export const Route = createFileRoute("/staff/kitchen")({ component: KitchenPage });
