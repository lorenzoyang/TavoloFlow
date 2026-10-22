import { createFileRoute } from "@tanstack/react-router";
import { MenuPage } from "@/features/menu/MenuPage";

export const Route = createFileRoute("/staff/menu")({ component: MenuPage });
