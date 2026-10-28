import { useMutation } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { logout } from "./api";
import { replaceAccount } from "./queries";
import { accountMessages } from "./messages";
import { VerifyIdentityButton } from "./AccountFeedback";

export function LogoutButton({ disabled = false }: { disabled?: boolean }) {
  const language = useStaffLanguage();
  const m = accountMessages[language];
  const mutation = useMutation({
    mutationFn: async () => {
      await logout();
      await replaceAccount(null);
    },
  });
  return (
    <div className="space-y-3">
      {mutation.isError && (
        <Notice tone="error">
          {errorMessage(mutation.error, m.unknownLogoutResult, language)}
        </Notice>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || mutation.isPending}
        aria-busy={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? <Spinner /> : <LogOut aria-hidden="true" />}
        <span aria-live="polite">{mutation.isPending ? m.loggingOut : m.logout}</span>
      </Button>
      {mutation.isError && <VerifyIdentityButton />}
    </div>
  );
}
