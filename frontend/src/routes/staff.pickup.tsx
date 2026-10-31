import { createFileRoute } from "@tanstack/react-router";
import { PickupSettingsPage } from "@/features/pickup/PickupSettingsPage";

export const Route = createFileRoute("/staff/pickup")({ component: PickupSettingsPage });
