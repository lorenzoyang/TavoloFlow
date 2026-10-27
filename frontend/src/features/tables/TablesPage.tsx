import { useRef, useState, type FormEvent, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import { ServiceSuspendedNotice } from "@/features/dining/ServiceNotice";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount, refreshAfterWrite } from "@/features/accounts/queries";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  createTable,
  deleteTable,
  renameTable,
  setTableEnabled,
  tablesQuery,
  type RestaurantTable,
} from "./api";
import { TableQr } from "./TableQr";

type Editor =
  | { kind: "create" }
  | { kind: "rename"; table: RestaurantTable }
  | { kind: "delete"; table: RestaurantTable };
const unknownResult = "操作结果待确认，请重新读取桌位列表并核对，再决定是否操作。";

// Creating and renaming share one label form; deletion is confirmed separately.
function TableLabelForm({
  editor,
  busy,
  error,
  submit,
  cancel,
  inputRef,
}: {
  editor: Extract<Editor, { kind: "create" | "rename" }>;
  busy: boolean;
  error: unknown;
  submit: (send: () => Promise<unknown>) => void;
  cancel: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [label, setLabel] = useState(editor.kind === "create" ? "" : editor.table.tableLabel);
  function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (editor.kind === "create") submit(() => createTable(label));
    else submit(() => renameTable(editor.table.id, label));
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="table-label">桌号</Label>
        <Input
          ref={inputRef}
          id="table-label"
          required
          maxLength={50}
          value={label}
          disabled={busy}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="例如：8、露台 A1"
        />
        {error instanceof ApiError &&
          error.errors.tableLabel?.map((message) => (
            <p key={message} className="text-sm text-destructive">
              {message}
            </p>
          ))}
      </div>
      {!!error && !(error instanceof ApiError && error.errors.tableLabel) && (
        <Notice tone="error">{errorMessage(error, unknownResult)}</Notice>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={cancel}>
          取消
        </Button>
        <Button type="submit" disabled={busy || !label.trim()}>
          {busy ? "正在处理…" : "保存桌位"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TablesContent({ account }: { account: CurrentAccount }) {
  const client = useQueryClient();
  const options = tablesQuery(account);
  const query = useQuery(options);
  const owner = account.role === "OWNER";
  const [editor, setEditor] = useState<Editor | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const labelInput = useRef<HTMLInputElement>(null);
  // Each mutation runs one request built by the table API functions.
  const mutation = useMutation({
    mutationFn: (send: () => Promise<unknown>) => send(),
    onMutate: () => setNotice(""),
    onSuccess: async () => {
      if (!isSameAccount(client, account)) return;
      setEditor(null);
      const result = await refreshAfterWrite(client, account, options);
      if (result === "refreshed") setNotice("桌位操作已成功。");
      else if (result === "failed") setNotice("操作已成功，但列表刷新失败。请重新读取桌位。");
    },
  });
  function open(next: Editor) {
    mutation.reset();
    setNotice("");
    setEditor(next);
  }
  function cancel() {
    setEditor(null);
    mutation.reset();
  }
  const tables = query.data;
  const qrTable = tables?.find((table) => table.id === qrId);
  const busy = mutation.isPending;
  return (
    <div>
      <PageHeader
        title="桌位与二维码"
        description={
          owner
            ? "维护桌位，下载二维码和桌卡，供顾客扫码点餐。"
            : "查看本店桌位与当前用餐状态；桌位由老板维护。"
        }
        back={{ to: "/staff", label: "首页" }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label="重新读取桌位"
            disabled={query.isFetching || busy}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          </Button>
        }
      />
      <div className="mb-5 space-y-3">
        <ServiceSuspendedNotice account={account} />
        {notice && <Notice tone="success">{notice}</Notice>}
        {(query.isError || query.fetchStatus === "paused") && (
          <Notice tone="error">无法更新桌位列表，请检查网络后重试。</Notice>
        )}
        {mutation.isError && !editor && (
          <Notice tone="error">{errorMessage(mutation.error, unknownResult)}</Notice>
        )}
        {owner && (
          <Button disabled={busy || !!editor} onClick={() => open({ kind: "create" })}>
            <Plus />
            添加桌位
          </Button>
        )}
      </div>
      {query.isPending && (
        <LoadingState
          label={
            query.fetchStatus === "paused" ? "当前离线，恢复网络后重新读取桌位。" : "正在读取桌位…"
          }
        />
      )}
      {tables?.length === 0 && (
        <EmptyState
          icon={QrCode}
          title="还没有桌位"
          description={owner ? "添加第一个桌位，即可生成菜单二维码。" : "请联系老板添加。"}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tables?.map((table) => (
          <article
            key={table.id}
            className={cn(
              "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs",
              !table.isEnabled && "border-dashed bg-muted/60",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold wrap-break-word">{table.tableLabel}</h2>
              <Badge variant={table.activeSessionId ? "default" : "outline"}>
                {table.activeSessionId ? "用餐中" : "空桌"}
              </Badge>
            </div>
            {owner ? (
              <div className="flex items-center gap-3">
                <Switch
                  aria-label={`启用桌位：${table.tableLabel}`}
                  checked={table.isEnabled}
                  disabled={busy || !!editor}
                  onCheckedChange={() =>
                    mutation.mutate(() => setTableEnabled(table.id, !table.isEnabled))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {table.isEnabled ? "已启用：顾客可扫码点餐" : "已停用：顾客只能浏览菜单"}
                </span>
              </div>
            ) : (
              <Badge variant={table.isEnabled ? "secondary" : "outline"}>
                {table.isEnabled ? "已启用" : "已停用"}
              </Badge>
            )}
            {owner && (
              <div className="mt-auto grid grid-cols-3 gap-2 border-t pt-3">
                <Button variant="outline" onClick={() => setQrId(table.id)}>
                  <QrCode />
                  二维码
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || !!editor}
                  onClick={() => open({ kind: "rename", table })}
                >
                  <Pencil />
                  改名
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || !!editor || !!table.activeSessionId}
                  onClick={() => open({ kind: "delete", table })}
                >
                  <Trash2 />
                  删除
                </Button>
              </div>
            )}
            {table.activeSessionId && (
              <p className="text-xs leading-5 text-muted-foreground">
                本桌用餐尚未结束，暂不可删除。
              </p>
            )}
          </article>
        ))}
      </div>
      <Dialog
        open={editor?.kind === "create" || editor?.kind === "rename"}
        onOpenChange={(next) => {
          if (!next && !busy) cancel();
        }}
      >
        <DialogContent initialFocus={labelInput}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {editor?.kind === "create" ? "添加桌位" : "修改桌号"}
            </DialogTitle>
            <DialogDescription>桌号 1–50 个字符，同店唯一；改名不会改变二维码。</DialogDescription>
          </DialogHeader>
          {(editor?.kind === "create" || editor?.kind === "rename") && (
            <TableLabelForm
              key={editor.kind === "create" ? "create" : `rename-${editor.table.id}`}
              editor={editor}
              busy={busy}
              error={mutation.error}
              submit={(send) => mutation.mutate(send)}
              cancel={cancel}
              inputRef={labelInput}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={editor?.kind === "delete"}
        tone="destructive"
        title={`确认删除桌位「${editor?.kind === "delete" ? editor.table.tableLabel : ""}」`}
        description="删除后，原二维码立即失效。历史账单保留；重新创建同名桌位需要重新下载二维码。"
        confirmLabel={busy ? "正在处理…" : "确认删除"}
        busy={busy}
        onConfirm={() => {
          if (editor?.kind === "delete") {
            const id = editor.table.id;
            mutation.mutate(() => deleteTable(id));
          }
        }}
        onCancel={cancel}
      >
        {mutation.isError && (
          <Notice tone="error">{errorMessage(mutation.error, unknownResult)}</Notice>
        )}
      </ConfirmDialog>
      {owner && (
        <Dialog
          open={!!qrTable}
          onOpenChange={(next) => {
            if (!next) setQrId(null);
          }}
        >
          <DialogContent>
            {qrTable && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold wrap-break-word">
                    {qrTable.tableLabel} · 桌位二维码
                  </DialogTitle>
                  <DialogDescription>{account.restaurantName}</DialogDescription>
                </DialogHeader>
                <TableQr key={qrTable.id} table={qrTable} restaurantName={account.restaurantName} />
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function TablesPage() {
  return (
    <AuthBoundary mode="account">
      {(account) => <TablesContent key={account.userId} account={account} />}
    </AuthBoundary>
  );
}
