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
import { ApiError, errorMessage, fieldErrors } from "@/lib/api";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import {
  createTable,
  deleteTable,
  renameTable,
  setTableEnabled,
  tablesQuery,
  type RestaurantTable,
} from "./api";
import { tableMessages } from "./messages";
import { TableQr } from "./TableQr";

type Editor =
  | { kind: "create" }
  | { kind: "rename"; table: RestaurantTable }
  | { kind: "delete"; table: RestaurantTable };

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
  const language = useStaffLanguage();
  const m = tableMessages[language];
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
        <Label htmlFor="table-label">{m.label}</Label>
        <Input
          ref={inputRef}
          id="table-label"
          required
          maxLength={50}
          value={label}
          disabled={busy}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={m.placeholder}
        />
        {fieldErrors(error, language).tableLabel?.map((message) => (
          <p key={message} className="text-sm text-destructive">
            {message}
          </p>
        ))}
      </div>
      {!!error && !(error instanceof ApiError && error.errors.tableLabel) && (
        <Notice tone="error">{errorMessage(error, m.unknownResult, language)}</Notice>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={cancel}>
          {staffMessages[language].cancel}
        </Button>
        <Button type="submit" disabled={busy || !label.trim()}>
          {busy ? m.saving : m.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TablesContent({ account }: { account: CurrentAccount }) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = tableMessages[language];
  const c = staffMessages[language];
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
      if (result === "refreshed") setNotice(m.saved);
      else if (result === "failed") setNotice(m.refreshFailed);
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
        title={m.title}
        description={owner ? m.ownerHint : m.staffHint}
        back={{ to: "/staff", label: c.home }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refresh}
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
          <Notice tone="error">{m.readError}</Notice>
        )}
        {mutation.isError && !editor && (
          <Notice tone="error">{errorMessage(mutation.error, m.unknownResult, language)}</Notice>
        )}
        {owner && (
          <Button disabled={busy || !!editor} onClick={() => open({ kind: "create" })}>
            <Plus />
            {m.add}
          </Button>
        )}
      </div>
      {query.isPending && (
        <LoadingState label={query.fetchStatus === "paused" ? m.offline : m.loading} />
      )}
      {tables?.length === 0 && (
        <EmptyState
          icon={QrCode}
          title={m.empty}
          description={owner ? m.ownerEmpty : m.staffEmpty}
        />
      )}
      {/* Columns follow the width left beside the nav rail, so each card keeps room for its three
          labelled actions on one line. */}
      <div className="@container">
        <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
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
                  {table.activeSessionId ? m.dining : m.free}
                </Badge>
              </div>
              {owner ? (
                <div className="flex items-center gap-3">
                  <Switch
                    aria-label={m.enable(table.tableLabel)}
                    checked={table.isEnabled}
                    disabled={busy || !!editor}
                    onCheckedChange={() =>
                      mutation.mutate(() => setTableEnabled(table.id, !table.isEnabled))
                    }
                  />
                  <span className="text-sm text-muted-foreground">
                    {table.isEnabled ? m.enabledHint : m.disabledHint}
                  </span>
                </div>
              ) : (
                <Badge variant={table.isEnabled ? "secondary" : "outline"}>
                  {table.isEnabled ? m.enabled : m.disabled}
                </Badge>
              )}
              {owner && (
                // Each button fills a third of the row, so slimmer padding only gives the label room
                // and keeps one-word labels on one line on 360px phones.
                <div className="mt-auto grid grid-cols-3 gap-2 border-t pt-3">
                  <Button variant="outline" className="px-2" onClick={() => setQrId(table.id)}>
                    <QrCode />
                    {m.qr}
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2"
                    disabled={busy || !!editor}
                    onClick={() => open({ kind: "rename", table })}
                  >
                    <Pencil />
                    {m.rename}
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2"
                    disabled={busy || !!editor || !!table.activeSessionId}
                    onClick={() => open({ kind: "delete", table })}
                  >
                    <Trash2 />
                    {m.remove}
                  </Button>
                </div>
              )}
              {table.activeSessionId && (
                <p className="text-xs leading-5 text-muted-foreground">{m.activeHint}</p>
              )}
            </article>
          ))}
        </div>
      </div>
      <Dialog
        open={editor?.kind === "create" || editor?.kind === "rename"}
        onOpenChange={(next) => {
          if (!next && !busy) cancel();
        }}
      >
        <DialogContent initialFocus={labelInput} closeLabel={c.close}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {editor?.kind === "create" ? m.add : m.renameTitle}
            </DialogTitle>
            <DialogDescription>{m.labelHint}</DialogDescription>
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
        title={m.removeTitle(editor?.kind === "delete" ? editor.table.tableLabel : "")}
        description={m.removeHint}
        confirmLabel={busy ? m.saving : m.confirmRemove}
        cancelLabel={c.cancel}
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
          <Notice tone="error">{errorMessage(mutation.error, m.unknownResult, language)}</Notice>
        )}
      </ConfirmDialog>
      {owner && (
        <Dialog
          open={!!qrTable}
          onOpenChange={(next) => {
            if (!next) setQrId(null);
          }}
        >
          <DialogContent closeLabel={c.close}>
            {qrTable && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold wrap-break-word">
                    {m.qrTitle(qrTable.tableLabel)}
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
