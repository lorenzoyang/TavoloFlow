import { createFileRoute, Outlet } from "@tanstack/react-router";
import { StaffLayout } from "@/features/accounts/AccountLayout";

export const Route = createFileRoute("/staff")({
  component: () => (
    <StaffLayout>
      <Outlet />
    </StaffLayout>
  ),
});
