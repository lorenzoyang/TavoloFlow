import { useId, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api";
import { login } from "./api";
import { replaceAccount } from "./queries";
import { messages as m } from "./messages";
import { ErrorNotice, VerifyIdentityButton } from "./AccountFeedback";
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
      <CardContent>
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
                className="h-11"
              />
            </Field>
            <PasswordInput
              name="password"
              label={m.password}
              autoComplete="current-password"
              disabled={mutation.isPending}
            />
            {mutation.isError && (
              <ErrorNotice message={errorMessage(mutation.error, m.loginUnknown)} />
            )}
            <Button type="submit" disabled={mutation.isPending} className="h-11 w-full">
              {mutation.isPending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <ArrowRight aria-hidden="true" />
              )}
              <span aria-live="polite">{mutation.isPending ? m.loggingIn : m.login}</span>
            </Button>
          </FieldSet>
          {mutation.isError &&
            !(mutation.error instanceof ApiError && mutation.error.status < 500) && (
              <VerifyIdentityButton />
            )}
        </form>
        <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">
          {m.loginFootnote}
        </p>
      </CardContent>
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
