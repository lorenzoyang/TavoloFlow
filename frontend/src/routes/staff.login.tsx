import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/features/accounts/LoginPage";

export const Route = createFileRoute("/staff/login")({ component: LoginPage });
