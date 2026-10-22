import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, QrCode, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { accountKey, queryClient } from "@/features/accounts/queries";
import { ApiError, errorMessage, write } from "@/lib/api";
import { tablesQuery, type RestaurantTable } from "./api";
import { TableQr } from "./TableQr";

type Editor = { kind: "create" } | { kind: "rename" | "delete"; table: RestaurantTable };
type Command = { path: string; method: "POST" | "PATCH" | "DELETE"; body?: unknown };
const base = "/api/owner/tables";

function TableEditor({ editor, busy, error, submit, cancel }: {
  editor: Editor; busy: boolean; error: unknown; submit: (command: Command) => void; cancel: () => void;
}) {
  const [label, setLabel] = useState(editor.kind === "create" ? "" : editor.table.tableLabel);
  const removing = editor.kind === "delete";
  const title = editor.kind === "create" ? "添加桌位" : removing ? "确认删除桌位" : "修改桌号";
  function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (editor.kind === "delete") submit({ path: `${base}/${editor.table.id}`, method: "DELETE" });
    else submit({ path: editor.kind === "create" ? base : `${base}/${editor.table.id}/label`,
      method: editor.kind === "create" ? "POST" : "PATCH", body: { tableLabel: label } });
  }
  return <Card><CardContent className="pt-6">
    <form onSubmit={save} className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {removing ? <p className="text-sm leading-6">删除「{editor.table.tableLabel}」后，原二维码立即失效。历史账单保留；重新创建同名桌位需要重新下载二维码。</p>
        : <div className="space-y-2"><Label htmlFor="table-label">桌号</Label>
          <Input id="table-label" autoFocus className="h-11" required maxLength={50} value={label}
            disabled={busy} onChange={event => setLabel(event.target.value)} placeholder="例如：8、露台 A1" />
          {error instanceof ApiError && error.errors.tableLabel?.map(message => <p key={message} className="text-sm text-destructive">{message}</p>)}
        </div>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-11" variant={removing ? "destructive" : "default"}
          disabled={busy || (!removing && !label.trim())}>{busy ? "正在处理…" : removing ? "确认删除" : "保存桌位"}</Button>
        <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={cancel}>取消</Button>
      </div>
    </form>
  </CardContent></Card>;
}

function TablesContent({ account }: { account: CurrentAccount }) {
  const options = tablesQuery(account);
  const query = useQuery(options);
  const owner = account.role === "OWNER";
  const [editor, setEditor] = useState<Editor | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const sameAccount = () => {
    const current = queryClient.getQueryData<CurrentAccount | null>(accountKey);
    return current?.userId === account.userId && current.restaurantId === account.restaurantId && !current.mustChangePassword;
  };
  const mutation = useMutation({
    mutationFn: (command: Command) => write(command.path, command.method, command.body),
    onMutate: () => setNotice(""),
    onSuccess: async () => {
      if (!sameAccount()) return;
      setEditor(null);
      try {
        await queryClient.cancelQueries({ queryKey: options.queryKey });
        if (!sameAccount()) return;
        await queryClient.fetchQuery(options);
        if (sameAccount()) setNotice("桌位操作已成功。");
      } catch {
        if (sameAccount()) setNotice("操作已成功，但列表刷新失败。请重新读取桌位。");
      }
    },
  });
  function open(next: Editor) {
    mutation.reset(); setNotice(""); setEditor(next);
    requestAnimationFrame(() => { editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); editorRef.current?.focus(); });
  }
  const tables = query.data;
  const qrTable = tables?.find(table => table.id === qrId);
  const busy = mutation.isPending;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><p className="mb-1 text-sm text-muted-foreground wrap-break-word">{account.restaurantName}</p>
        <h1 className="text-2xl font-semibold">桌位管理</h1>
        <p className="mt-2 text-sm text-muted-foreground">{owner ? "维护桌位，下载二维码，供顾客浏览菜单。" : "查看本店桌位与当前用餐状态；桌位由老板维护。"}</p></div>
      <Link to="/staff" className={buttonVariants({ variant: "outline", className: "h-11" })}><ArrowLeft />返回账号</Link>
    </div>
    {notice && <Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert>}
    {(query.isError || query.fetchStatus === "paused") && <Alert variant="destructive"><AlertDescription>无法更新桌位列表，请检查网络后重试。</AlertDescription></Alert>}
    {mutation.isError && <Alert variant="destructive" role="alert"><AlertDescription>
      {errorMessage(mutation.error, "操作结果待确认，请重新读取桌位列表并核对，再决定是否操作。")}
    </AlertDescription></Alert>}
    <div className="flex flex-wrap gap-3">
      <Link to="/staff/floor" className={buttonVariants({ variant: "outline", className: "h-11" })}>开桌工作台</Link>
      {owner && <Button className="h-11" disabled={busy || !!editor} onClick={() => open({ kind: "create" })}><Plus />添加桌位</Button>}
      <Button className="h-11" variant="outline" disabled={query.isFetching || busy} onClick={() => void query.refetch()}><RefreshCw />重新读取桌位</Button>
    </div>
    <div ref={editorRef} tabIndex={-1} className="scroll-mt-6 rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
      {editor && <TableEditor key={editor.kind === "create" ? "create" : `${editor.kind}-${editor.table.id}`}
        editor={editor} busy={busy} error={mutation.error} submit={command => mutation.mutate(command)}
        cancel={() => { setEditor(null); mutation.reset(); }} />}
    </div>
    {owner && qrTable && <TableQr key={qrTable.id} table={qrTable} restaurantName={account.restaurantName} close={() => setQrId(null)} />}
    {query.isPending && <p role="status">{query.fetchStatus === "paused" ? "当前离线，恢复网络后重新读取桌位。" : "正在读取桌位…"}</p>}
    {tables?.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">还没有桌位。{owner ? "添加第一个桌位，即可生成菜单二维码。" : "请联系老板添加。"}</CardContent></Card>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tables?.map(table => <Card key={table.id}><CardContent className="space-y-4 pt-6">
        <h2 className="text-xl font-semibold wrap-break-word">{table.tableLabel}</h2>
        <div className="flex flex-wrap gap-2"><Badge variant={table.isEnabled ? "secondary" : "outline"}>{table.isEnabled ? "已启用" : "已停用"}</Badge>
          <Badge variant="outline">{table.activeSessionId ? "用餐中" : "空桌"}</Badge></div>
        {owner && <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={() => setQrId(table.id)}><QrCode />二维码</Button>
          <Button variant="outline" className="h-11" disabled={busy || !!editor} onClick={() => open({ kind: "rename", table })}>改名</Button>
          <Button variant="outline" className="h-11" disabled={busy || !!editor} onClick={() => mutation.mutate({
            path: `${base}/${table.id}/enabled`, method: "PATCH", body: { isEnabled: !table.isEnabled },
          })}>{table.isEnabled ? "停用" : "启用"}</Button>
          <Button variant="outline" className="h-11" disabled={busy || !!editor || !!table.activeSessionId}
            onClick={() => open({ kind: "delete", table })}>删除</Button>
        </div>}
        {table.activeSessionId && <p className="text-xs leading-5 text-muted-foreground">本桌用餐尚未结束，暂不可删除。</p>}
      </CardContent></Card>)}
    </div>
  </div>;
}

export function TablesPage() {
  return <AuthBoundary mode="account">{account => <TablesContent key={account.userId} account={account} />}</AuthBoundary>;
}
