import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/brand";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { ApiError, errorMessage } from "@/lib/api";
import { changePlatformPassword, platformLogin, platformLogout } from "./api";
import { platformQuery, replacePlatform, type PlatformIdentity } from "./identity";
import { PlatformSubscriptionReminders } from "@/features/subscriptions/SubscriptionReminders";

export function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <BrandMark caption="平台管理 · 餐厅开通与账号维护" />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-12">{children}</main>
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
  const query = useQuery(platformQuery);
  const failed = query.isError || query.fetchStatus === "paused";
  if (query.isPending || (query.isError && !query.data))
    return failed ? (
      <Notice tone="error" action={<Button onClick={() => void query.refetch()}>重新读取</Button>}>
        无法确认平台身份，请检查网络。
      </Notice>
    ) : (
      <LoadingState label="正在确认平台身份…" />
    );
  if (login && query.data) return <Navigate to="/platform/restaurants" replace />;
  if (!login && !query.data) return <Navigate to="/platform/login" replace />;
  return (
    <>
      {query.isError && (
        <Notice tone="error" className="mb-5">
          平台身份更新失败，请刷新后再操作。
        </Notice>
      )}
      {children(query.data ?? null)}
    </>
  );
}

const navLink = buttonVariants({
  variant: "ghost",
  className: "aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground",
});

export function PlatformNavigation({ account }: { account: PlatformIdentity }) {
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
      setError(errorMessage(e, "退出结果待确认，请重新读取平台身份。"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-6 space-y-3">
      <nav
        aria-label="平台导航"
        className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2 shadow-xs"
      >
        <Link to="/platform/restaurants" className={navLink}>
          餐厅管理
        </Link>
        <Link to="/platform/change-password" className={navLink}>
          修改平台密码
        </Link>
        <span className="ml-auto px-2 text-sm text-muted-foreground">{account.username}</span>
        <Button variant="outline" disabled={busy} onClick={() => void logout()}>
          退出平台
        </Button>
      </nav>
      {error && <Notice tone="error">{error}</Notice>}
      <PlatformSubscriptionReminders userId={account.userId} />
    </div>
  );
}

function PlatformForm({ password = false }: { password?: boolean }) {
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
      setMessage("两次新密码不一致。");
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
        setMessage(password ? "平台密码已更新，其他旧登录已失效。" : "登录成功。");
      }
    } catch (e) {
      if (!work.signal.aborted)
        setMessage(errorMessage(e, "结果待确认，请重新读取平台身份；不会自动重发请求。"));
    } finally {
      form.reset();
      if (!work.signal.aborted) setBusy(false);
    }
  };
  return (
    <Card className="mx-auto max-w-md [--card-spacing:--spacing(6)]">
      <CardContent className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {password ? "修改平台密码" : "平台管理员登录"}
        </h1>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            {!password && (
              <div className="space-y-2">
                <Label htmlFor="platform-username">用户名</Label>
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
                  ["currentPassword", "当前密码", "current-password"],
                  ["newPassword", "新密码", "new-password"],
                  ["confirmPassword", "再次输入新密码", "new-password"],
                ]
              : [["password", "密码", "current-password"]]
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
            {password && (
              <p className="text-sm text-muted-foreground">
                6–128 个字符，可使用纯数字，不能全部为空白。
              </p>
            )}
            <Button type="submit" size="lg" className="w-full">
              {busy ? "正在提交…" : password ? "保存平台密码" : "登录平台"}
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
  return (
    <PlatformBoundary>
      {(account) => (
        <>
          <PlatformNavigation account={account!} />
          <PlatformForm key={account!.userId} password />
        </>
      )}
    </PlatformBoundary>
  );
}
