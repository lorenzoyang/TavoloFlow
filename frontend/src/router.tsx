import { createRootRoute, createRoute, createRouter, Link, Navigate, Outlet } from "@tanstack/react-router";
import { AccountPage, AccountShell, ChangePasswordPage, LoginPage } from "@/features/accounts/AccountPages";
import { messages } from "@/features/accounts/messages";

const rootRoute = createRootRoute({
  component: () => <AccountShell><Outlet /></AccountShell>,
  notFoundComponent: () => <div className="space-y-4 text-center">
    <h1 className="text-xl font-semibold">{messages.notFound}</h1>
    <Link to="/staff" className="text-sm underline">{messages.goToAccount}</Link>
  </div>,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/staff" replace />,
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/login",
  component: LoginPage,
});
const passwordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/change-password",
  component: ChangePasswordPage,
});
const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff",
  validateSearch: (search: Record<string, unknown>): { passwordChanged?: boolean } => ({
    passwordChanged: search.passwordChanged === true || search.passwordChanged === "true" || undefined,
  }),
  component: () => <AccountPage passwordChanged={accountRoute.useSearch().passwordChanged === true} />,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, loginRoute, passwordRoute, accountRoute]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
