import { createFileRoute } from "@tanstack/react-router";
import { OwnerSubscriptionPage } from "@/features/subscriptions/OwnerSubscriptionPage";

export const Route = createFileRoute("/staff/subscription")({ component: OwnerSubscriptionPage });
