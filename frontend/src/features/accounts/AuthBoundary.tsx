import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { CurrentAccount } from "./api";
import { accountQuery } from "./queries";
import { messages as m } from "./messages";

type AuthBoundaryProps =
  | { mode: "login"; children: () => ReactNode }
  | { mode: "account" | "password"; children: (account: CurrentAccount) => ReactNode };

// Observe the identity cache so login, logout and rejected credentials update every page.
export function AuthBoundary(props: AuthBoundaryProps) {
  const query = useQuery(accountQuery);
  if ((query.isError && !query.data) || (query.isPending && query.fetchStatus === "paused")) {
    return (
      <div className="space-y-4">
        <Notice tone="error">{m.connectionError}</Notice>
        <Button
          className="w-full sm:w-auto"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching && <Spinner />}
          {m.retry}
        </Button>
      </div>
    );
  }
  if (query.isPending) return <LoadingState label={m.loading} />;
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
  return (
    <>
      {query.isError && (
        <Notice
          tone="error"
          className="mb-5"
          action={
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {m.retry}
            </Button>
          }
        >
          {m.connectionError}
        </Notice>
      )}
      {props.children(account)}
    </>
  );
}
