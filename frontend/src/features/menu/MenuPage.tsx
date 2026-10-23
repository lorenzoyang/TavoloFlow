import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, RefreshCw, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import { isSameAccount, refreshAfterWrite } from "@/features/accounts/queries";
import type { CurrentAccount } from "@/features/accounts/api";
import { ApiError, errorMessage } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deleteMenuEntry,
  menuQuery,
  saveCategory,
  saveItem,
  setDefaultLanguage,
  setItemAvailability,
  type Category,
  type Menu,
  type MenuItem,
} from "./api";
import { displayName } from "@/lib/language";
import { CategoryForm, ItemForm } from "./MenuForms";
import { languages, messages as m } from "./messages";

type Editor =
  | { kind: "category"; value?: Category }
  | { kind: "item"; value?: MenuItem; categoryId: string }
  | {
      kind: "delete";
      resource: "categories" | "items";
      id: string;
      name: string;
    };
function MenuContent({ account }: { account: CurrentAccount }) {
  const client = useQueryClient();
  const options = menuQuery(account);
  const query = useQuery(options);
  const owner = account.role === "OWNER";
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  // Each mutation runs one request built by the menu API functions.
  const mutation = useMutation({
    mutationFn: (send: () => Promise<unknown>) => send(),
    onMutate: () => {
      setNotice("");
    },
    onSuccess: async () => {
      if (!isSameAccount(client, account)) return;
      setEditor(null);
      const result = await refreshAfterWrite(client, account, options);
      if (result === "refreshed") setNotice(m.saved);
      else if (result === "failed") setNotice(m.refreshFailed);
    },
  });
  const busy = mutation.isPending;
  const editing = editor !== null;
  function open(next: Editor) {
    mutation.reset();
    setNotice("");
    setEditor(next);
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      editorRef.current?.focus();
    });
  }
  function cancel() {
    setEditor(null);
    mutation.reset();
  }
  const feedback = mutation.isError ? (
    <Alert variant="destructive" role="alert">
      <AlertDescription className="space-y-3">
        <p>{errorMessage(mutation.error, m.unknown)}</p>
        {(!(mutation.error instanceof ApiError) || mutation.error.status >= 500) && (
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {m.retry}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  ) : null;
  const menu = query.data;
  // A removed selection falls back to the full menu without discarding an open form.
  const selected = menu?.categories.find((value) => value.id === categoryId);
  const items = menu?.items.filter((item) => !selected || item.categoryId === selected.id) ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-muted-foreground">{account.restaurantName}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{m.title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {owner ? m.ownerHint : m.staffHint}
          </p>
        </div>
        <Link to="/staff" className={buttonVariants({ variant: "outline", className: "h-11" })}>
          <ArrowLeft />
          {m.back}
        </Link>
      </div>
      {notice && (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {query.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{m.readError}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="h-11"
          disabled={query.isFetching || busy}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          {m.refresh}
        </Button>
        {owner && menu && (
          <>
            <Button
              className="h-11"
              variant="outline"
              disabled={busy || editing}
              onClick={() => open({ kind: "category" })}
            >
              <Plus />
              {m.addCategory}
            </Button>
            <Button
              className="h-11"
              disabled={busy || editing || menu.categories.length === 0}
              onClick={() =>
                open({
                  kind: "item",
                  categoryId: selected?.id ?? menu.categories[0].id,
                })
              }
            >
              <Plus />
              {m.addItem}
            </Button>
          </>
        )}
      </div>
      {!menu && query.isPending && (
        <p role="status" className="py-12 text-center text-muted-foreground">
          {query.fetchStatus === "paused" ? m.readError : m.loading}
        </p>
      )}
      {!editor && feedback}
      {menu && (
        <>
          <Card>
            <CardContent className="pt-6">
              <DefaultLanguage
                key={menu.defaultLanguage}
                menu={menu}
                owner={owner}
                busy={busy || editing}
                save={(language) => mutation.mutate(() => setDefaultLanguage(language))}
              />
            </CardContent>
          </Card>
          {editor && (
            <Card>
              <CardContent className="pt-6">
                <div ref={editorRef} tabIndex={-1} className="scroll-mt-6 outline-none">
                  {editor.kind === "category" && (
                    <CategoryForm
                      key={`category-${editor.value?.id ?? "new"}`}
                      initial={editor.value}
                      busy={busy}
                      error={mutation.error}
                      cancel={cancel}
                      save={(body) => mutation.mutate(() => saveCategory(editor.value?.id, body))}
                      feedback={feedback}
                    />
                  )}
                  {editor.kind === "item" && (
                    <ItemForm
                      key={`item-${editor.value?.id ?? "new"}`}
                      initial={editor.value}
                      menu={menu}
                      categoryId={editor.categoryId}
                      busy={busy}
                      error={mutation.error}
                      cancel={cancel}
                      save={(body) => mutation.mutate(() => saveItem(editor.value?.id, body))}
                      feedback={feedback}
                    />
                  )}
                  {editor.kind === "delete" && (
                    <div className="space-y-4">
                      <h2 className="wrap-break-word text-lg font-semibold">
                        {m.remove}「{editor.name}」
                      </h2>
                      <p className="text-sm leading-6 text-muted-foreground">{m.deleteHint}</p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          className="h-11"
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            mutation.mutate(() => deleteMenuEntry(editor.resource, editor.id))
                          }
                        >
                          {busy ? m.saving : m.confirmDelete}
                        </Button>
                        <Button className="h-11" variant="outline" disabled={busy} onClick={cancel}>
                          {m.cancel}
                        </Button>
                      </div>
                      {feedback}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
            <nav aria-label={m.categories} className="space-y-2">
              <h2 className="mb-3 text-sm font-semibold">{m.categories}</h2>
              <Button
                variant={!selected ? "secondary" : "ghost"}
                className="min-h-11 w-full justify-start"
                onClick={() => setCategoryId(null)}
                aria-pressed={!selected}
              >
                {m.all} ({menu.items.length})
              </Button>
              {menu.categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selected?.id === category.id ? "secondary" : "ghost"}
                  className="h-auto min-h-11 w-full justify-start whitespace-normal wrap-break-word text-left"
                  onClick={() => setCategoryId(category.id)}
                  aria-pressed={selected?.id === category.id}
                >
                  {displayName(category, menu.defaultLanguage, "zh").text} (
                  {menu.items.filter((item) => item.categoryId === category.id).length})
                </Button>
              ))}
            </nav>
            <section
              className="min-w-0 space-y-4"
              aria-label={selected ? displayName(selected, menu.defaultLanguage, "zh").text : m.all}
            >
              {selected && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="wrap-break-word text-lg font-semibold">
                    {displayName(selected, menu.defaultLanguage, "zh").text}
                  </h2>
                  {owner && (
                    <div className="flex gap-2">
                      <Button
                        className="h-11"
                        variant="outline"
                        disabled={busy || editing}
                        onClick={() => open({ kind: "category", value: selected })}
                      >
                        {m.editCategory}
                      </Button>
                      <Button
                        className="h-11"
                        variant="ghost"
                        disabled={busy || editing}
                        onClick={() =>
                          open({
                            kind: "delete",
                            resource: "categories",
                            id: selected.id,
                            name: displayName(selected, menu.defaultLanguage, "zh").text,
                          })
                        }
                      >
                        {m.remove}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {items.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-sm leading-6 text-muted-foreground">
                    <Utensils className="mx-auto mb-4 size-8" />
                    {owner ? (menu.categories.length ? m.noItems : m.noCategories) : m.staffEmpty}
                  </CardContent>
                </Card>
              )}
              {items.map((item) => {
                const name = displayName(item, menu.defaultLanguage, "zh");
                const description = {
                  zh: item.descriptionZh,
                  it: item.descriptionIt,
                  en: item.descriptionEn,
                }[name.language];
                return (
                  <Card key={item.id}>
                    <CardContent className="space-y-4 pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="mb-1 wrap-break-word text-xs text-muted-foreground">
                            {
                              displayName(
                                menu.categories.find(
                                  (category) => category.id === item.categoryId,
                                )!,
                                menu.defaultLanguage,
                                "zh",
                              ).text
                            }
                            {item.itemCode ? ` · ${item.itemCode}` : ""}
                          </p>
                          <h3 className="wrap-break-word font-semibold">{name.text}</h3>
                          {description && (
                            <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm text-muted-foreground">
                              {description}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 font-medium tabular-nums">
                          €{formatCents(item.priceCents)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={item.isAvailable ? "secondary" : "outline"}>
                          {item.isAvailable ? m.available : m.soldOut}
                        </Badge>
                        {item.allergenReviewed &&
                          item.allergenCodes.map((code) => (
                            <Badge variant="outline" key={code}>
                              {menu.allergens.find((option) => option.code === code)?.label ?? code}
                            </Badge>
                          ))}
                      </div>
                      {!item.allergenReviewed ? (
                        <p className="text-sm text-destructive">{m.unreviewed}</p>
                      ) : (
                        item.allergenCodes.length === 0 && (
                          <p className="text-xs text-muted-foreground">{m.reviewedEmpty}</p>
                        )
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="h-11"
                          variant="outline"
                          disabled={
                            busy || editing || (!item.isAvailable && !item.allergenReviewed)
                          }
                          onClick={() =>
                            mutation.mutate(() => setItemAvailability(item.id, !item.isAvailable))
                          }
                        >
                          {item.isAvailable ? m.markSoldOut : m.restore}
                        </Button>
                        {owner && (
                          <>
                            <Button
                              className="h-11"
                              variant="outline"
                              disabled={busy || editing}
                              onClick={() =>
                                open({
                                  kind: "item",
                                  value: item,
                                  categoryId: item.categoryId,
                                })
                              }
                            >
                              {m.edit}
                            </Button>
                            <Button
                              className="h-11"
                              variant="ghost"
                              disabled={busy || editing}
                              onClick={() =>
                                open({
                                  kind: "delete",
                                  resource: "items",
                                  id: item.id,
                                  name: name.text,
                                })
                              }
                            >
                              {m.remove}
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function DefaultLanguage({
  menu,
  owner,
  busy,
  save,
}: {
  menu: Menu;
  owner: boolean;
  busy: boolean;
  save: (language: string) => void;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) save(String(new FormData(event.currentTarget).get("defaultLanguage")));
      }}
    >
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
        <label htmlFor="defaultLanguage" className="text-sm font-medium">
          {m.defaultLanguage}
        </label>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{m.defaultHint}</p>
      </div>
      <select
        id="defaultLanguage"
        name="defaultLanguage"
        defaultValue={menu.defaultLanguage}
        disabled={!owner || busy}
        className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {languages.map((language) => (
          <option value={language.code} key={language.code}>
            {language.label}
          </option>
        ))}
      </select>
      {owner && (
        <Button type="submit" className="h-11" variant="outline" disabled={busy}>
          {m.setDefault}
        </Button>
      )}
    </form>
  );
}

export function MenuPage() {
  return (
    <AuthBoundary mode="account">
      {(account) => (
        <MenuContent key={`${account.restaurantId}-${account.userId}`} account={account} />
      )}
    </AuthBoundary>
  );
}
