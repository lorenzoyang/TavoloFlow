import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  changePassword,
  errorMessage,
  login,
  logout,
  type CurrentAccount,
} from "./api";
import { acceptAccount, accountQuery } from "./queries";
import { messages as m } from "./messages";

const inputClass =
  "h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10 text-foreground sm:py-16">
      <div className="mx-auto max-w-md">
        <header className="mb-10 flex items-center justify-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-900 text-white">
            <Utensils aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-xl font-semibold tracking-tight">{m.brand}</p>
            <p className="text-xs tracking-widest text-muted-foreground">
              {m.brandCaption}
            </p>
          </div>
        </header>
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </section>
        <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">
          {m.sessionNote}
        </p>
      </div>
    </main>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm leading-6 text-red-800"
    >
      {message}
    </p>
  );
}

function AuthBoundary({
  mode,
  children,
}: {
  mode: "login" | "account" | "password";
  children: (account: CurrentAccount | null) => ReactNode;
}) {
  const query = useQuery(accountQuery);
  if (query.isPending)
    return (
      <p
        role="status"
        className="py-10 text-center text-sm text-muted-foreground"
      >
        {m.loading}
      </p>
    );
  if (query.isError) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={m.connectionError} />
        <Button
          className="h-11 w-full"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {m.retry}
        </Button>
      </div>
    );
  }
  const account = query.data;
  if (!account && mode !== "login")
    return <Navigate to="/staff/login" replace />;
  if (account?.mustChangePassword && mode !== "password")
    return <Navigate to="/staff/change-password" replace />;
  if (account && !account.mustChangePassword && mode === "login")
    return <Navigate to="/staff" replace />;
  return children(account);
}

function PageTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function PasswordInput({
  name,
  label,
  autoComplete,
  minimum,
}: {
  name: string;
  label: string;
  autoComplete: string;
  minimum?: number;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={minimum}
          maxLength={128}
          autoComplete={autoComplete}
          className={`${inputClass} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={`${visible ? m.hidePassword : m.showPassword}：${label}`}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground focus-visible:outline-2"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function VerifyIdentityButton() {
  const query = useQuery(accountQuery);
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full"
      disabled={query.isFetching}
      onClick={() => void query.refetch()}
    >
      {m.verifyIdentity}
    </Button>
  );
}

function LoginForm() {
  const usernameId = useId();
  const mutation = useMutation({
    mutationFn: async ({
      username,
      password,
    }: {
      username: string;
      password: string;
    }) => {
      const account = await login(username, password);
      await acceptAccount(account);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    mutation.mutate(
      {
        username: String(data.get("username")),
        password: String(data.get("password")),
      },
      { onSuccess: () => form.reset() },
    );
  }
  return (
    <>
      <PageTitle title={m.loginTitle} description={m.loginDescription} />
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={mutation.isPending} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor={usernameId} className="block text-sm font-medium">
              {m.username}
            </label>
            <input
              id={usernameId}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={50}
              className={inputClass}
            />
          </div>
          <PasswordInput
            name="password"
            label={m.password}
            autoComplete="current-password"
          />
          {mutation.isError && (
            <ErrorNotice
              message={errorMessage(mutation.error, m.loginUnknown)}
            />
          )}
          <Button type="submit" className="h-12 w-full gap-2 rounded-xl">
            {mutation.isPending ? m.loggingIn : m.login}
            <ArrowRight aria-hidden="true" />
          </Button>
        </fieldset>
        {mutation.isError &&
          !(
            mutation.error instanceof ApiError && mutation.error.status < 500
          ) && <VerifyIdentityButton />}
      </form>
      <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">
        {m.loginFootnote}
      </p>
    </>
  );
}

function LogoutButton({ disabled = false }: { disabled?: boolean }) {
  const mutation = useMutation({
    mutationFn: async () => {
      await logout();
      await acceptAccount(null);
    },
  });
  return (
    <div className="space-y-3">
      {mutation.isError && (
        <ErrorNotice
          message={errorMessage(mutation.error, m.unknownLogoutResult)}
        />
      )}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full rounded-xl"
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        <LogOut aria-hidden="true" />
        {mutation.isPending ? m.loggingOut : m.logout}
      </Button>
      {mutation.isError && <VerifyIdentityButton />}
    </div>
  );
}

function PasswordForm({ account }: { account: CurrentAccount }) {
  const navigate = useNavigate();
  const [validationError, setValidationError] = useState("");
  const mutation = useMutation({
    mutationFn: async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => {
      const updated = await changePassword(currentPassword, newPassword);
      await acceptAccount(updated);
      await navigate({
        to: "/staff",
        search: { passwordChanged: true },
        replace: true,
      });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword"));
    if (newPassword !== data.get("confirmPassword")) {
      setValidationError(m.passwordMismatch);
      return;
    }
    if (
      newPassword.length < 12 ||
      newPassword.length > 128 ||
      !newPassword.trim()
    ) {
      setValidationError(m.invalidPassword);
      return;
    }
    setValidationError("");
    mutation.mutate(
      { currentPassword: String(data.get("currentPassword")), newPassword },
      { onSuccess: () => form.reset() },
    );
  }
  return (
    <>
      <PageTitle
        title={account.mustChangePassword ? m.firstChangeTitle : m.changeTitle}
        description={
          account.mustChangePassword
            ? m.firstChangeDescription
            : m.changeDescription
        }
      />
      <form onSubmit={submit} className="space-y-4">
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={account.username}
          readOnly
          hidden
        />
        <fieldset disabled={mutation.isPending} className="space-y-5">
          <PasswordInput
            name="currentPassword"
            label={m.currentPassword}
            autoComplete="current-password"
          />
          <PasswordInput
            name="newPassword"
            label={m.newPassword}
            autoComplete="new-password"
            minimum={12}
          />
          <p className="-mt-3 text-xs leading-5 text-muted-foreground">
            {m.passwordHint}
          </p>
          <PasswordInput
            name="confirmPassword"
            label={m.confirmPassword}
            autoComplete="new-password"
            minimum={12}
          />
          {validationError && <ErrorNotice message={validationError} />}
          {mutation.isError && (
            <ErrorNotice
              message={errorMessage(mutation.error, m.unknownPasswordResult)}
            />
          )}
          <Button type="submit" className="h-12 w-full rounded-xl">
            {mutation.isPending ? m.savingPassword : m.savePassword}
          </Button>
        </fieldset>
        {mutation.isError &&
          !(
            mutation.error instanceof ApiError && mutation.error.status < 500
          ) && <VerifyIdentityButton />}
      </form>
      <div className="mt-5 space-y-3">
        {!account.mustChangePassword && !mutation.isPending && (
          <Link
            to="/staff"
            className="flex h-11 items-center justify-center gap-2 rounded-xl text-sm hover:bg-muted"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {m.back}
          </Link>
        )}
        <LogoutButton disabled={mutation.isPending} />
      </div>
    </>
  );
}

function AccountDetails({
  account,
  passwordChanged,
}: {
  account: CurrentAccount;
  passwordChanged: boolean;
}) {
  return (
    <>
      <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
        <Check className="size-3" aria-hidden="true" />
        {m.signedIn}
      </div>
      <PageTitle title={m.accountTitle} description={m.accountDescription} />
      {passwordChanged && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900"
        >
          {m.changeSuccess}
        </p>
      )}
      <dl className="mb-7 divide-y divide-border rounded-xl border px-4">
        {[
          [m.restaurant, account.restaurantName],
          [m.username, account.username],
          [m.role, account.role === "OWNER" ? m.owner : m.staff],
        ].map(([label, value]) => (
          <div key={label} className="py-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 wrap-break-word text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <Link
        to="/staff/change-password"
        className="mb-3 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/80"
      >
        <KeyRound className="size-4" aria-hidden="true" />
        {m.changeTitle}
      </Link>
      <LogoutButton />
    </>
  );
}

export function LoginPage() {
  return <AuthBoundary mode="login">{() => <LoginForm />}</AuthBoundary>;
}

export function ChangePasswordPage() {
  return (
    <AuthBoundary mode="password">
      {(account) => <PasswordForm key={account!.userId} account={account!} />}
    </AuthBoundary>
  );
}

export function AccountPage({ passwordChanged }: { passwordChanged: boolean }) {
  return (
    <AuthBoundary mode="account">
      {(account) => (
        <AccountDetails account={account!} passwordChanged={passwordChanged} />
      )}
    </AuthBoundary>
  );
}
