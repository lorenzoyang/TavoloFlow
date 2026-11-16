import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, UserRound } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { SourceLink } from "@/components/source-link";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, errorMessage } from "@/lib/api";
import { changePlatformPassword, platformLogin, platformLogout } from "./api";
import { platformQuery, replacePlatform, type PlatformIdentity } from "./identity";
import { LanguageSwitch } from "@/features/accounts/LanguageSwitch";
import { listSearch } from "./list-search";
import { htmlLang } from "@/lib/staff-language";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { platformMessages } from "./messages";

// Platform pages share the store pages' device language; the switch stays in the header, next to
// the signed-in administrator's menu. The identity query is the one PlatformBoundary observes.
export function PlatformLayout({ children }: { children: ReactNode }) {
  const language = useStaffLanguage();
  const identity = useQuery(platformQuery).data;
  useEffect(() => {
    const root = document.documentElement;
    root.lang = htmlLang(language);
    return () => {
      root.lang = "zh-CN";
    };
  }, [language]);
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card pt-safe">
        {/* Phones: the brand on its own row, then the language switch and the account menu at the
            right; one row from sm. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <BrandMark caption={platformMessages[language].brandCaption} className="mr-auto" />
          <LanguageSwitch />
          {identity && <AccountMenu key={identity.userId} account={identity} />}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-6">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-safe">
        <SourceLink />
      </footer>
    </div>
  );
}

export function PlatformBoundary({
  login = false,
  children,
}: {
  login?: boolean;
  children: (identity: PlatformIdentity | null) => ReactNode;
}) {
  const m = platformMessages[useStaffLanguage()];
  const query = useQuery(platformQuery);
  const failed = query.isError || query.fetchStatus === "paused";
  if (query.isPending || (query.isError && !query.data))
    return failed ? (
      <Notice
        tone="error"
        action={<Button onClick={() => void query.refetch()}>{m.reload}</Button>}
      >
        {m.identityError}
      </Notice>
    ) : (
      <LoadingState label={m.identityLoading} />
    );
  if (login && query.data) return <Navigate to="/platform/restaurants" replace />;
  if (!login && !query.data) return <Navigate to="/platform/login" replace />;
  return (
    <>
      {query.isError && (
        <Notice tone="error" className="mb-5">
          {m.identityStale}
        </Notice>
      )}
      {children(query.data ?? null)}
    </>
  );
}

function AccountMenu({ account }: { account: PlatformIdentity }) {
  const language = useStaffLanguage();
  const m = platformMessages[language];
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      try {
        await platformLogout();
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
      }
      await replacePlatform(null);
    } catch (e) {
      setError(errorMessage(e, m.logoutUnknown, language));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className="ml-auto sm:ml-0"
              disabled={busy}
              aria-label={account.username}
            >
              <UserRound />
              <span className="hidden max-w-40 truncate sm:inline">{account.username}</span>
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void navigate({ to: "/platform/change-password" })}>
            {m.changePassword}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void logout()}>{m.logout}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <Notice tone="error" className="basis-full">
          {error}
        </Notice>
      )}
    </>
  );
}

function PlatformForm({ password = false }: { password?: boolean }) {
  const language = useStaffLanguage();
  const m = platformMessages[language];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (password && data.get("newPassword") !== data.get("confirmPassword")) {
      setMessage(m.passwordMismatch);
      return;
    }
    setBusy(true);
    setMessage("");
    const work = new AbortController();
    controller.current = work;
    try {
      const account = password
        ? await changePlatformPassword(
            String(data.get("currentPassword")),
            String(data.get("newPassword")),
            work.signal,
          )
        : await platformLogin(
            String(data.get("username")),
            String(data.get("password")),
            work.signal,
          );
      if (!work.signal.aborted) {
        await replacePlatform(account);
        setMessage(password ? m.passwordChanged : m.loggedIn);
      }
    } catch (e) {
      if (!work.signal.aborted) setMessage(errorMessage(e, m.formUnknown, language));
    } finally {
      form.reset();
      if (!work.signal.aborted) setBusy(false);
    }
  };
  return (
    <Card className="mx-auto max-w-md [--card-spacing:--spacing(6)]">
      <CardContent className="space-y-5">
        {!password && <h1 className="text-2xl font-semibold tracking-tight">{m.loginTitle}</h1>}
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            {!password && (
              <div className="space-y-2">
                <Label htmlFor="platform-username">{m.username}</Label>
                <Input
                  id="platform-username"
                  name="username"
                  autoComplete="username"
                  required
                  maxLength={50}
                />
              </div>
            )}
            {(password
              ? [
                  ["currentPassword", m.currentPassword, "current-password"],
                  ["newPassword", m.newPassword, "new-password"],
                  ["confirmPassword", m.confirmPassword, "new-password"],
                ]
              : [["password", m.password, "current-password"]]
            ).map(([name, label, complete]) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={`platform-${name}`}>{label}</Label>
                <Input
                  id={`platform-${name}`}
                  name={name}
                  type="password"
                  autoComplete={complete}
                  required
                  maxLength={128}
                  minLength={complete === "new-password" ? 6 : undefined}
                />
              </div>
            ))}
            {password && <p className="text-sm text-muted-foreground">{m.passwordHint}</p>}
            <Button type="submit" size="lg" className="w-full">
              {busy ? m.submitting : password ? m.savePassword : m.login}
            </Button>
          </fieldset>
        </form>
        {message && <Notice>{message}</Notice>}
      </CardContent>
    </Card>
  );
}

export function PlatformLoginPage() {
  return <PlatformBoundary login>{() => <PlatformForm />}</PlatformBoundary>;
}
export function PlatformPasswordPage() {
  const language = useStaffLanguage();
  return (
    <PlatformBoundary>
      {(account) => (
        <div className="mx-auto max-w-md">
          <PageHeader
            title={platformMessages[language].changePassword}
            back={{
              to: "/platform/restaurants",
              search: listSearch(),
              label: platformMessages[language].backToList,
            }}
          />
          <PlatformForm key={account!.userId} password />
        </div>
      )}
    </PlatformBoundary>
  );
}
