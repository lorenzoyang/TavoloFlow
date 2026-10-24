import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TemporaryCredential, ManagedAccount } from "./state";

// Shown once: the passwords live only in this component's memory and vanish when it closes.
export function TemporaryPasswords({
  credentials,
  close,
}: {
  credentials: TemporaryCredential[];
  close: () => void;
}) {
  const [notice, setNotice] = useState("");
  if (!credentials.length) return null;
  return (
    <section
      aria-labelledby="temporary-passwords"
      className="my-5 space-y-4 rounded-2xl border border-warning/60 bg-warning/12 p-4"
    >
      <div className="flex items-start gap-3">
        <KeyRound aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-foreground" />
        <div>
          <h2 id="temporary-passwords" className="font-semibold">
            请安全交付临时密码
          </h2>
          <p className="text-sm leading-6">
            仅本次展示。关闭、离开或隐藏页面后无法再次查看；首次登录必须修改密码。
          </p>
        </div>
      </div>
      {credentials.map((c) => (
        <div key={c.account.id} className="space-y-2 rounded-xl border bg-card p-3">
          <p className="text-sm font-medium">
            {c.account.role} · {c.account.username}
          </p>
          <code
            className="block font-mono text-lg font-semibold break-all select-all"
            data-testid={`temporary-${c.account.role}`}
          >
            {c.temporaryPassword}
          </code>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(c.temporaryPassword);
                setNotice("已复制，请通过安全渠道交付。");
              } catch {
                setNotice("无法自动复制，请选中文字手动复制。");
              }
            }}
          >
            <Copy />
            复制 {c.account.role} 临时密码
          </Button>
        </div>
      ))}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <Button onClick={close}>已保存，关闭密码展示</Button>
    </section>
  );
}

export function AccountActions({
  account,
  disabled,
  platform,
  choose,
}: {
  account: ManagedAccount;
  disabled: boolean;
  platform: boolean;
  choose: (kind: "reset" | "active", account: ManagedAccount) => void;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <p className="font-semibold wrap-break-word">
          {account.role} · {account.username}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant={account.isActive ? "success" : "outline"}>
            {account.isActive ? "账号已启用" : "账号已禁用"}
          </Badge>
          <Badge variant={account.mustChangePassword ? "warning" : "secondary"}>
            {account.mustChangePassword ? "登录后须修改临时密码" : "已完成改密"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => choose("reset", { ...account })}
          >
            重置 {account.role} 密码
          </Button>
          {platform && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => choose("active", { ...account })}
            >
              {account.isActive ? "禁用" : "启用"} {account.role} 账号
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
