import { useId, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api";
import { login } from "./api";
import { replaceAccount } from "./queries";
import { messages as m } from "./messages";
import { VerifyIdentityButton } from "./AccountFeedback";
import { AccountCard, AccountCardHeader } from "./AccountLayout";
import { AuthBoundary } from "./AuthBoundary";
import { PasswordInput } from "./PasswordInput";

function LoginForm() {
  const usernameId = useId();
  const mutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const account = await login(username, password);
      await replaceAccount(account);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    mutation.mutate(
      { username: String(data.get("username")), password: String(data.get("password")) },
      { onSuccess: () => form.reset() },
    );
  }
  return (
    <>
      <AccountCardHeader title={m.loginTitle} description={m.loginDescription} />
      <form onSubmit={submit} className="space-y-4" aria-busy={mutation.isPending}>
        <FieldSet disabled={mutation.isPending} className="gap-5">
          <Field data-disabled={mutation.isPending}>
            <FieldLabel htmlFor={usernameId}>{m.username}</FieldLabel>
            <Input
              id={usernameId}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={50}
              disabled={mutation.isPending}
            />
          </Field>
          <PasswordInput
            name="password"
            label={m.password}
            autoComplete="current-password"
            disabled={mutation.isPending}
          />
          {mutation.isError && (
            <Notice tone="error">{errorMessage(mutation.error, m.loginUnknown)}</Notice>
          )}
          <Button type="submit" size="lg" disabled={mutation.isPending} className="w-full">
            {mutation.isPending ? <Spinner /> : <ArrowRight aria-hidden="true" />}
            <span aria-live="polite">{mutation.isPending ? m.loggingIn : m.login}</span>
          </Button>
        </FieldSet>
        {mutation.isError &&
          !(mutation.error instanceof ApiError && mutation.error.status < 500) && (
            <VerifyIdentityButton />
          )}
      </form>
      <p className="text-center text-xs leading-6 text-muted-foreground">
        {m.loginFootnote}
        <br />
        {m.sessionNote}
      </p>
    </>
  );
}

export function LoginPage() {
  return (
    <AccountCard>
      <AuthBoundary mode="login">{() => <LoginForm />}</AuthBoundary>
    </AccountCard>
  );
}
