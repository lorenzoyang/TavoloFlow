import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button-variants";
import { accountMessages } from "@/features/accounts/messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: function NotFound() {
    const messages = accountMessages[useStaffLanguage()];
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-8 px-4 pt-[max(3rem,env(safe-area-inset-top))]">
        <BrandMark />
        <EmptyState
          icon={SearchX}
          title={<h1>{messages.notFound}</h1>}
          action={
            <Link to="/staff" className={buttonVariants()}>
              {messages.goToAccount}
            </Link>
          }
        />
      </main>
    );
  },
});
