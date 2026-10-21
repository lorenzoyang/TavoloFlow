import { useQuery } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { accountQuery } from "./queries";
import { messages as m } from "./messages";

export function ErrorNotice({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="leading-6">{message}</AlertDescription>
    </Alert>
  );
}

export function VerifyIdentityButton() {
  const query = useQuery(accountQuery);
  return (
    <Button type="button" variant="outline" className="h-11 w-full"
      disabled={query.isFetching} onClick={() => void query.refetch()}>
      {query.isFetching && <LoaderCircle aria-hidden="true" className="animate-spin" />}
      {m.verifyIdentity}
    </Button>
  );
}
