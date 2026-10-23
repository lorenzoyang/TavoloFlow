import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/platform/restaurants")({ component: Outlet });
