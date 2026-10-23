import { createFileRoute } from "@tanstack/react-router";
import { StaffSettingsPage } from "@/features/platform/StaffSettingsPage";

export const Route = createFileRoute("/staff/settings")({ component: StaffSettingsPage });
