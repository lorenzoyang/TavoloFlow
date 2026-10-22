import { createFileRoute } from "@tanstack/react-router";
import { FloorPage } from "@/features/dining/FloorPage";

export const Route = createFileRoute("/staff/floor")({ component: FloorPage });
