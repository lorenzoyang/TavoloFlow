import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { messages } from "@/features/accounts/messages";

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">{messages.notFound}</h1>
      <Link to="/staff" className="inline-flex min-h-11 items-center text-sm underline">
        {messages.goToAccount}
      </Link>
    </main>
  ),
});
