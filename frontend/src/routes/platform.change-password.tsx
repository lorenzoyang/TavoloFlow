import { createFileRoute } from "@tanstack/react-router";
import { PlatformPasswordPage } from "@/features/platform/PlatformAuth";

export const Route = createFileRoute("/platform/change-password")({ component: PlatformPasswordPage });
