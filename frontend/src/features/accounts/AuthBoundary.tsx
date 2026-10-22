import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import type { CurrentAccount } from "./api";
import { accountQuery } from "./queries";
import { messages as m } from "./messages";
import { ErrorNotice } from "./AccountFeedback";

type AuthBoundaryProps =
  | { mode: "login"; children: () => ReactNode }
  | { mode: "account" | "password"; children: (account: CurrentAccount) => ReactNode };

// Observe the identity cache so login, logout and rejected credentials update every page.
export function AuthBoundary(props: AuthBoundaryProps) {
  const query = useQuery(accountQuery);
  if ((query.isError && !query.data) || (query.isPending && query.fetchStatus === "paused")) {
    return (
      <CardContent className="space-y-4">
        <ErrorNotice message={m.connectionError} />
        <Button className="h-11 w-full" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {m.retry}
        </Button>
      </CardContent>
    );
  }
  if (query.isPending) {
    return (
      <CardContent>
        <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {m.loading}
        </p>
      </CardContent>
    );
  }
  const account = query.data;
  if (account?.mustChangePassword && props.mode !== "password") {
    return <Navigate to="/staff/change-password" replace />;
  }
  if (props.mode === "login") {
    return account ? <Navigate to="/staff" replace /> : props.children();
  }
  if (!account) return <Navigate to="/staff/login" replace />;
  // A failed background identity refresh must not unmount an in-progress menu form.
  // A real 401 still produces null above, clears private queries and redirects.
  return <>
    {query.isError && <div className="mb-5 space-y-3">
      <ErrorNotice message={m.connectionError} />
      <Button className="h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>{m.retry}</Button>
    </div>}
    {props.children(account)}
  </>;
}
