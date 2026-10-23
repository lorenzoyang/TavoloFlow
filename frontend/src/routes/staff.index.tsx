import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/features/accounts/AccountPage";

export const Route = createFileRoute("/staff/")({
  validateSearch: (search: Record<string, unknown>): { passwordChanged?: boolean } => ({
    passwordChanged:
      search.passwordChanged === true || search.passwordChanged === "true" || undefined,
  }),
  component: function StaffAccountPage() {
    const { passwordChanged } = Route.useSearch();
    return <AccountPage passwordChanged={passwordChanged === true} />;
  },
});
