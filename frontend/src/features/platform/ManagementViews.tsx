import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { TemporaryCredential, ManagedAccount } from "./state";

export function TemporaryPasswords({ credentials, close }: { credentials: TemporaryCredential[]; close: () => void }) {
  const [notice, setNotice] = useState("");
  if (!credentials.length) return null;
  return <Alert className="my-5"><AlertDescription className="space-y-4">
    <p className="font-semibold">请安全交付临时密码</p><p>仅本次展示。关闭、离开或隐藏页面后无法再次查看；首次登录必须修改密码。</p>
    {credentials.map(c => <div key={c.account.id} className="space-y-2 rounded-md border p-3">
      <p>{c.account.role} · {c.account.username}</p>
      <code className="block select-all break-all" data-testid={`temporary-${c.account.role}`}>{c.temporaryPassword}</code>
      <Button variant="outline" className="min-h-11" onClick={async () => {
        try { await navigator.clipboard.writeText(c.temporaryPassword); setNotice("已复制，请通过安全渠道交付。"); }
        catch { setNotice("无法自动复制，请选中文字手动复制。"); }
      }}>复制 {c.account.role} 临时密码</Button>
    </div>)}
    {notice && <p role="status">{notice}</p>}
    <Button className="min-h-11" onClick={close}>已保存，关闭密码展示</Button>
  </AlertDescription></Alert>;
}

export function AccountActions({ account, disabled, platform, choose }: { account: ManagedAccount; disabled: boolean;
  platform: boolean; choose: (kind: "reset" | "active", account: ManagedAccount) => void }) {
  return <div className="space-y-3 rounded-lg border p-4">
    <p className="font-medium">{account.role} · {account.username}</p>
    <p className="text-sm text-muted-foreground">{account.isActive ? "账号已启用" : "账号已禁用"} · {account.mustChangePassword ? "登录后须修改临时密码" : "已完成改密"}</p>
    <div className="flex flex-wrap gap-3"><Button className="min-h-11" variant="outline" disabled={disabled} onClick={() => choose("reset", { ...account })}>重置 {account.role} 密码</Button>
      {platform && <Button className="min-h-11" variant="outline" disabled={disabled} onClick={() => choose("active", { ...account })}>{account.isActive ? "禁用" : "启用"} {account.role} 账号</Button>}
    </div>
  </div>;
}
