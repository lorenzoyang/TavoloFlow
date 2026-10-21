import { createFileRoute } from "@tanstack/react-router";
import { ChangePasswordPage } from "@/features/accounts/ChangePasswordPage";

export const Route = createFileRoute("/staff/change-password")({ component: ChangePasswordPage });
