import { createFileRoute } from "@tanstack/react-router";
import { OnlineOrdersPage } from "@/features/online/OnlineOrdersPage";

export const Route = createFileRoute("/staff/online")({ component: OnlineOrdersPage });
