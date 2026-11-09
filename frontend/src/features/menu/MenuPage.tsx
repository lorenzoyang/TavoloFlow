import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Trash2, Utensils, X } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { FilterChips } from "@/components/filter-chips";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import { isSameAccount, refreshAfterWrite } from "@/features/accounts/queries";
import type { CurrentAccount } from "@/features/accounts/api";
import { ApiError, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import {
  deleteItemImage,
  deleteMenuEntry,
  deleteOptionGroup,
  menuQuery,
  reorderOptionGroups,
  saveCategory,
  saveItem,
  saveOptionGroup,
  setDefaultLanguage,
  setItemAvailability,
  setOptionAvailability,
  uploadItemImage,
  type Category,
  type Menu,
  type MenuItem,
  type OptionGroup,
} from "./api";
import { displayName } from "@/lib/language";
import { ItemImageSection, ItemThumbnail } from "./ItemImage";
import { CategoryForm, ItemForm } from "./MenuForms";
import { allergenLabel, languages, menuMessages } from "./messages";
import { OptionGroupForm } from "./OptionGroupForm";
import { OptionGroups, TemplatePicker } from "./OptionGroups";
import type { OptionTemplate } from "./option-templates";

type Editor =
  | { kind: "category"; value?: Category }
  | { kind: "item"; value?: MenuItem; categoryId: string }
  // A new option group starts from a template (or a blank form).
  | { kind: "templates" }
  | { kind: "group"; value?: OptionGroup; template?: OptionTemplate }
  | {
      kind: "delete";
      resource: "categories" | "items" | "option-groups";
      id: string;
      name: string;
      // How many dishes a deleted option group leaves.
      dishes?: number;
    };
function MenuContent({ account }: { account: CurrentAccount }) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = menuMessages[language];
  const options = menuQuery(account);
  const query = useQuery(options);
  const owner = account.role === "OWNER";
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tab, setTab] = useState<"dishes" | "options">("dishes");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState("");
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
  const [photoNotice, setPhotoNotice] = useState<{ tone: "success" | "warning"; text: string }>();
  // Photo writes keep the item editor open: the section shows the refreshed photo in place.
  const imageMutation = useMutation({
    mutationFn: (send: () => Promise<unknown>) => send(),
    onMutate: () => {
      setPhotoNotice(undefined);
    },
    onSuccess: async () => {
      if (!isSameAccount(client, account)) return;
      const result = await refreshAfterWrite(client, account, options);
      if (result === "refreshed") setPhotoNotice({ tone: "success", text: m.photoSaved });
      else if (result === "failed") setPhotoNotice({ tone: "warning", text: m.refreshFailed });
    },
  });
  const busy = mutation.isPending || imageMutation.isPending;
  const editing = editor !== null;
  function open(next: Editor) {
    mutation.reset();
    imageMutation.reset();
    setNotice("");
    setPhotoNotice(undefined);
    setEditor(next);
  }
  function cancel() {
    setEditor(null);
    mutation.reset();
    imageMutation.reset();
    setPhotoNotice(undefined);
  }
  const failure = (error: unknown) => (
    <Notice
      tone="error"
      action={
        (!(error instanceof ApiError) || error.status >= 500) && (
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {m.retry}
          </Button>
        )
      }
    >
      {errorMessage(error, m.unknown, language)}
    </Notice>
  );
  const feedback = mutation.isError ? failure(mutation.error) : null;
  const photoError = imageMutation.isError ? failure(imageMutation.error) : null;
  const menu = query.data;
  // A removed selection falls back to the full menu without discarding an open form.
  const selected = menu?.categories.find((value) => value.id === categoryId);
  const items = menu?.items.filter((item) => !selected || item.categoryId === selected.id) ?? [];
  const categoryName = (id: string) =>
    displayName(
      menu!.categories.find((category) => category.id === id)!,
      menu!.defaultLanguage,
      language,
    ).text;
  const formOpen =
    editor?.kind === "category" ||
    editor?.kind === "item" ||
    editor?.kind === "templates" ||
    editor?.kind === "group";
  // Lists every group in its new order, so a repeated or late request changes nothing more.
  function moveGroup(index: number, by: number) {
    const ids = menu!.optionGroups.map((group) => group.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    mutation.mutate(() => reorderOptionGroups(ids));
  }
  // The photo section follows the live menu, unlike the form fields, which keep their snapshot.
  const liveItem =
    editor?.kind === "item" && editor.value
      ? menu?.items.find((item) => item.id === editor.value?.id)
      : undefined;
  return (
    <div>
      <PageHeader
        title={m.title}
        description={owner ? m.ownerHint : m.staffHint}
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
        {notice && <Notice tone="success">{notice}</Notice>}
        {query.isError && <Notice tone="error">{m.readError}</Notice>}
        {!editor && feedback}
      </div>
      {!menu && query.isPending && (
        <LoadingState label={query.fetchStatus === "paused" ? m.readError : m.loading} />
      )}
      {menu && (
        <Tabs
          value={tab}
          onValueChange={(value: "dishes" | "options") => setTab(value)}
          className="gap-5"
        >
          <TabsList className="w-full sm:w-80">
            <TabsTrigger value="dishes">{m.dishesTab}</TabsTrigger>
            <TabsTrigger value="options">{m.optionsTab}</TabsTrigger>
          </TabsList>
          <TabsContent value="options" className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              {owner ? m.optionsHint : m.optionsStaffHint}
            </p>
            {owner && (
              <Button disabled={busy || editing} onClick={() => open({ kind: "templates" })}>
                <Plus />
                {m.addOptionGroup}
              </Button>
            )}
            <OptionGroups
              menu={menu}
              owner={owner}
              disabled={busy || editing}
              toggle={(option) =>
                mutation.mutate(() => setOptionAvailability(option.id, !option.isAvailable))
              }
              edit={(group) => open({ kind: "group", value: group })}
              remove={(group, dishes) =>
                open({
                  kind: "delete",
                  resource: "option-groups",
                  id: group.id,
                  name: displayName(group, menu.defaultLanguage, language).text,
                  dishes,
                })
              }
              move={moveGroup}
            />
          </TabsContent>
          <TabsContent value="dishes" className="space-y-5">
            {owner && (
              <div className="grid grid-cols-2 gap-3 sm:flex">
                <Button
                  variant="outline"
                  disabled={busy || editing}
                  onClick={() => open({ kind: "category" })}
                >
                  <Plus />
                  {m.addCategory}
                </Button>
                <Button
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
              </div>
            )}
            <FilterChips
              label={m.categories}
              value={selected?.id ?? ""}
              onChange={(id) => setCategoryId(id || null)}
              items={[
                { value: "", label: `${m.all} (${menu.items.length})` },
                ...menu.categories.map((category) => ({
                  value: category.id,
                  label: `${displayName(category, menu.defaultLanguage, language).text} (${
                    menu.items.filter((item) => item.categoryId === category.id).length
                  })`,
                })),
              ]}
            />
            {selected && owner && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold wrap-break-word">
                  {displayName(selected, menu.defaultLanguage, language).text}
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || editing}
                    onClick={() => open({ kind: "category", value: selected })}
                  >
                    <Pencil />
                    {m.editCategory}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy || editing}
                    onClick={() =>
                      open({
                        kind: "delete",
                        resource: "categories",
                        id: selected.id,
                        name: displayName(selected, menu.defaultLanguage, language).text,
                      })
                    }
                  >
                    <Trash2 />
                    {m.remove}
                  </Button>
                </div>
              </div>
            )}
            {items.length === 0 && (
              <EmptyState
                icon={Utensils}
                title={owner ? (menu.categories.length ? m.noItems : m.noCategories) : m.staffEmpty}
              />
            )}
            <ul className="grid gap-3 lg:grid-cols-2">
              {items.map((item) => {
                const name = displayName(item, menu.defaultLanguage, language);
                const description = {
                  zh: item.descriptionZh,
                  it: item.descriptionIt,
                  en: item.descriptionEn,
                }[name.language];
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs text-muted-foreground wrap-break-word">
                          {categoryName(item.categoryId)}
                          {item.itemCode ? ` · ${item.itemCode}` : ""}
                        </p>
                        <h3
                          className={cn(
                            "font-semibold wrap-break-word",
                            !item.isAvailable && "text-muted-foreground",
                          )}
                        >
                          {name.text}
                        </h3>
                        {description && (
                          <p className="line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground wrap-break-word">
                            {description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="font-semibold tabular-nums">
                          {formatMoney(item.priceCents, language)}
                        </span>
                        {item.imageId && (
                          <ItemThumbnail imageId={item.imageId} className="size-16" />
                        )}
                      </div>
                    </div>
                    {!item.allergenReviewed ? (
                      <p className="text-sm text-destructive">{m.unreviewed}</p>
                    ) : item.allergenCodes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{m.reviewedEmpty}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {item.allergenCodes.map((code) => (
                          <Badge variant="outline" key={code}>
                            {allergenLabel(
                              menu.allergens.find((option) => option.code === code) ?? {
                                code,
                                label: code,
                              },
                              language,
                            )}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {/* Wraps the owner's buttons under the switch when the labels are longer (Italian). */}
                    <div className="mt-auto flex flex-wrap items-center gap-3 border-t pt-3">
                      <Switch
                        aria-label={m.availability(name.text)}
                        checked={item.isAvailable}
                        disabled={busy || editing || (!item.isAvailable && !item.allergenReviewed)}
                        onCheckedChange={() =>
                          mutation.mutate(() => setItemAvailability(item.id, !item.isAvailable))
                        }
                      />
                      <span
                        className={cn(
                          "text-sm font-medium",
                          item.isAvailable ? "text-success" : "text-muted-foreground",
                        )}
                      >
                        {item.isAvailable ? m.available : m.soldOut}
                      </span>
                      {owner && (
                        <div className="ml-auto flex gap-1">
                          <Button
                            variant="ghost"
                            disabled={busy || editing}
                            aria-label={m.editOf(name.text)}
                            onClick={() =>
                              open({
                                kind: "item",
                                value: item,
                                categoryId: item.categoryId,
                              })
                            }
                          >
                            <Pencil />
                            {m.edit}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy || editing}
                            aria-label={m.removeOf(name.text)}
                            onClick={() =>
                              open({
                                kind: "delete",
                                resource: "items",
                                id: item.id,
                                name: name.text,
                              })
                            }
                          >
                            <Trash2 />
                            {m.remove}
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <section
              aria-labelledby="menu-settings"
              className="rounded-2xl border bg-card p-4 shadow-xs"
            >
              <h2 id="menu-settings" className="mb-3 font-semibold">
                {m.settings}
              </h2>
              <DefaultLanguage
                key={menu.defaultLanguage}
                menu={menu}
                owner={owner}
                busy={busy || editing}
                save={(language) => mutation.mutate(() => setDefaultLanguage(language))}
              />
            </section>
          </TabsContent>
        </Tabs>
      )}
      <Sheet
        open={formOpen}
        onOpenChange={(next) => {
          if (!next && !busy) cancel();
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          <SheetHeader className="flex-row items-center justify-between gap-3 border-b pt-[max(1rem,env(safe-area-inset-top))]">
            <SheetTitle className="text-lg font-semibold">
              {editor?.kind === "category"
                ? editor.value
                  ? m.editCategory
                  : m.addCategory
                : editor?.kind === "templates"
                  ? m.templateTitle
                  : editor?.kind === "group"
                    ? editor.value
                      ? m.editOptionGroup
                      : m.addOptionGroup
                    : editor?.kind === "item" && editor.value
                      ? m.editItem
                      : m.addItem}
            </SheetTitle>
            <SheetClose
              disabled={busy}
              render={
                <Button variant="ghost" size="icon" aria-label={m.cancel} className="-mr-2" />
              }
            >
              <X />
            </SheetClose>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            {menu && editor?.kind === "category" && (
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
            {editor?.kind === "templates" && (
              <TemplatePicker choose={(template) => open({ kind: "group", template })} />
            )}
            {menu && editor?.kind === "group" && (
              <OptionGroupForm
                key={`group-${editor.value?.id ?? editor.template?.key ?? "new"}`}
                initial={editor.value}
                template={editor.template}
                menu={menu}
                busy={busy}
                error={mutation.error}
                cancel={cancel}
                save={(body) => mutation.mutate(() => saveOptionGroup(editor.value?.id, body))}
                feedback={feedback}
              />
            )}
            {menu && editor?.kind === "item" && liveItem && (
              <ItemImageSection
                item={liveItem}
                busy={busy}
                error={photoError}
                notice={photoNotice && <Notice tone={photoNotice.tone}>{photoNotice.text}</Notice>}
                upload={(file) => imageMutation.mutate(() => uploadItemImage(liveItem.id, file))}
                clear={() => {
                  imageMutation.reset();
                  setPhotoNotice(undefined);
                }}
                remove={(done) =>
                  imageMutation.mutate(() => deleteItemImage(liveItem.id), { onSuccess: done })
                }
              />
            )}
            {menu && editor?.kind === "item" && !editor.value && (
              <FieldDescription className="mb-5">{m.photoAfterCreate}</FieldDescription>
            )}
            {menu && editor?.kind === "item" && (
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
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={editor?.kind === "delete"}
        tone="destructive"
        title={editor?.kind === "delete" ? m.removeTitle(editor.name) : ""}
        description={
          editor?.kind === "delete" && editor.resource === "option-groups"
            ? m.removeGroupHint(editor.dishes ?? 0)
            : m.deleteHint
        }
        confirmLabel={busy ? m.saving : m.confirmDelete}
        busy={busy}
        onConfirm={() => {
          if (editor?.kind !== "delete") return;
          const { resource, id } = editor;
          mutation.mutate(() =>
            resource === "option-groups" ? deleteOptionGroup(id) : deleteMenuEntry(resource, id),
          );
        }}
        onCancel={cancel}
      >
        {feedback}
      </ConfirmDialog>
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
  const m = menuMessages[useStaffLanguage()];
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
      <NativeSelect
        id="defaultLanguage"
        name="defaultLanguage"
        defaultValue={menu.defaultLanguage}
        disabled={!owner || busy}
      >
        {languages.map(({ code }) => (
          <NativeSelectOption value={code} key={code}>
            {m.languageNames[code]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {owner && (
        <Button type="submit" variant="outline" disabled={busy}>
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
