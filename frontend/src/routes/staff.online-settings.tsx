import { createFileRoute } from "@tanstack/react-router";
import { OnlineSettingsPage } from "@/features/online/OnlineSettingsPage";

export const Route = createFileRoute("/staff/online-settings")({ component: OnlineSettingsPage });
