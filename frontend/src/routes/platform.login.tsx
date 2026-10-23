import { createFileRoute } from "@tanstack/react-router";
import { PlatformLoginPage } from "@/features/platform/PlatformAuth";

export const Route = createFileRoute("/platform/login")({ component: PlatformLoginPage });
