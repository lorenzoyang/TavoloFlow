import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Spinner } from "@/components/ui/spinner";
import { FieldSet } from "@/components/ui/field";
import { ApiError, errorMessage } from "@/lib/api";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { changePassword, type CurrentAccount } from "./api";
import { replaceAccount } from "./queries";
import { accountMessages } from "./messages";
import { VerifyIdentityButton } from "./AccountFeedback";
import { AccountCard, AccountCardHeader } from "./AccountLayout";
import { AuthBoundary } from "./AuthBoundary";
import { PasswordInput } from "./PasswordInput";
import { LogoutButton } from "./LogoutButton";

type PasswordValidationError = { field: "newPassword" | "confirmPassword"; message: string };

function PasswordForm({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = accountMessages[language];
  const navigate = useNavigate();
  const [validationError, setValidationError] = useState<PasswordValidationError | null>(null);
  const mutation = useMutation({
    mutationFn: async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => {
      const updated = await changePassword(currentPassword, newPassword);
      await replaceAccount(updated);
      await navigate({ to: "/staff", search: { passwordChanged: true }, replace: true });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword"));
    function reject(field: PasswordValidationError["field"], message: string) {
      setValidationError({ field, message });
      (form.elements.namedItem(field) as HTMLInputElement).focus();
    }
    if (newPassword !== data.get("confirmPassword")) {
      reject("confirmPassword", m.passwordMismatch);
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128 || !newPassword.trim()) {
      reject("newPassword", m.invalidPassword);
      return;
    }
    setValidationError(null);
    mutation.mutate(
      { currentPassword: String(data.get("currentPassword")), newPassword },
      { onSuccess: () => form.reset() },
    );
  }
  return (
    <>
      <AccountCardHeader
        title={account.mustChangePassword ? m.firstChangeTitle : m.changeTitle}
        description={account.mustChangePassword ? undefined : m.changeDescription}
      />
      {account.mustChangePassword && <Notice>{m.firstChangeDescription}</Notice>}
      <form onSubmit={submit} className="space-y-4" aria-busy={mutation.isPending}>
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={account.username}
          readOnly
          hidden
        />
        <FieldSet disabled={mutation.isPending} className="gap-5">
          <PasswordInput
            name="currentPassword"
            label={m.currentPassword}
            autoComplete="current-password"
            disabled={mutation.isPending}
          />
          <PasswordInput
            name="newPassword"
            label={m.newPassword}
            autoComplete="new-password"
            minimum={6}
            description={m.passwordHint}
            disabled={mutation.isPending}
            error={validationError?.field === "newPassword" ? validationError.message : undefined}
            onChange={() => setValidationError(null)}
          />
          <PasswordInput
            name="confirmPassword"
            label={m.confirmPassword}
            autoComplete="new-password"
            minimum={6}
            disabled={mutation.isPending}
            error={
              validationError?.field === "confirmPassword" ? validationError.message : undefined
            }
            onChange={() => setValidationError(null)}
          />
          {mutation.isError && (
            <Notice tone="error">
              {errorMessage(mutation.error, m.unknownPasswordResult, language)}
            </Notice>
          )}
          <Button type="submit" size="lg" disabled={mutation.isPending} className="w-full">
            {mutation.isPending && <Spinner />}
            <span aria-live="polite">{mutation.isPending ? m.savingPassword : m.savePassword}</span>
          </Button>
        </FieldSet>
        {mutation.isError &&
          !(mutation.error instanceof ApiError && mutation.error.status < 500) && (
            <VerifyIdentityButton />
          )}
      </form>
      <div className="space-y-3">
        {!account.mustChangePassword && !mutation.isPending && (
          <Link to="/staff" className={buttonVariants({ variant: "ghost", className: "w-full" })}>
            <ArrowLeft aria-hidden="true" />
            {m.back}
          </Link>
        )}
        <LogoutButton disabled={mutation.isPending} />
      </div>
    </>
  );
}

export function ChangePasswordPage() {
  return (
    <AccountCard>
      <AuthBoundary mode="password">
        {(account) => <PasswordForm key={account.userId} account={account} />}
      </AuthBoundary>
    </AccountCard>
  );
}
