import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PlatformLayout } from "@/features/platform/PlatformAuth";

export const Route = createFileRoute("/platform")({
  component: () => (
    <PlatformLayout>
      <Outlet />
    </PlatformLayout>
  ),
});
