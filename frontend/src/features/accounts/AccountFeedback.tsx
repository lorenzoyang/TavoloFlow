import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { accountQuery } from "./queries";
import { accountMessages } from "./messages";

// After an unknown login/logout/password result, the only safe next step is to read the identity again.
export function VerifyIdentityButton() {
  const m = accountMessages[useStaffLanguage()];
  const query = useQuery(accountQuery);
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={query.isFetching}
      onClick={() => void query.refetch()}
    >
      {query.isFetching && <Spinner />}
      {m.verifyIdentity}
    </Button>
  );
}
