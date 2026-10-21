import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage, logout } from "./api";
import { acceptAccount } from "./queries";
import { messages as m } from "./messages";
import { ErrorNotice, VerifyIdentityButton } from "./AccountFeedback";

export function LogoutButton({ disabled = false }: { disabled?: boolean }) {
  const mutation = useMutation({
    mutationFn: async () => {
      await logout();
      await acceptAccount(null);
    },
  });
  return (
    <div className="space-y-3">
      {mutation.isError && <ErrorNotice message={errorMessage(mutation.error, m.unknownLogoutResult)} />}
      <Button type="button" variant="outline" className="h-11 w-full"
        disabled={disabled || mutation.isPending} aria-busy={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <LogOut aria-hidden="true" />}
        <span aria-live="polite">{mutation.isPending ? m.loggingOut : m.logout}</span>
      </Button>
      {mutation.isError && <VerifyIdentityButton />}
    </div>
  );
}
