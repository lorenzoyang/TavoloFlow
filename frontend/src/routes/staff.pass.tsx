import { createFileRoute } from "@tanstack/react-router";
import { PassPage } from "@/features/pass/PassPage";

export const Route = createFileRoute("/staff/pass")({ component: PassPage });
