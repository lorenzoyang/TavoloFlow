import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Pencil, Plus, RefreshCw, Trash2, Utensils } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { FilterChips } from "@/components/filter-chips";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import { isSameAccount, refreshAfterWrite } from "@/features/accounts/queries";
import type { CurrentAccount } from "@/features/accounts/api";
import { staffNavItems } from "@/features/accounts/navigation";
import { ApiError, errorMessage } from "@/lib/api";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import {
  deleteItemImage,
  deleteMenuEntry,
  deleteOptionGroup,
  menuQuery,
  reorderCategories,
  reorderOptionGroups,
  setDefaultLanguage,
  setItemAvailability,
  setOptionAvailability,
  uploadItemImage,
  type Menu,
} from "./api";
import { displayName } from "@/lib/language";
import { ItemImageSection } from "./ItemImage";
import { CategoryOrder } from "./CategoryOrder";
import { languages, menuMessages } from "./messages";
import { OptionGroups } from "./OptionGroups";
import { MenuDishList } from "./MenuDishList";
import { MenuEditorSheet, type MenuEditor } from "./MenuEditorSheet";

function MenuContent({ account }: { account: CurrentAccount }) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = menuMessages[language];
  const options = menuQuery(account);
  const query = useQuery(options);
  const owner = account.role === "OWNER";
  // Only pages outside the tabs link back: with dine-in and online ordering both on, the menu is a
  // Home entry.
  const isTab = staffNavItems(account, language).some((item) => item.to === "/staff/menu");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tab, setTab] = useState<"dishes" | "options">("dishes");
  const [editor, setEditor] = useState<MenuEditor | null>(null);
  const [notice, setNotice] = useState("");
  // The control (a dish, an option group, "categories" or "language") whose write ran outside an
  // editor: its result shows beside it, since it may be far down the page.
  const [inline, setInline] = useState<string | null>(null);
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
  function open(next: MenuEditor) {
    mutation.reset();
    imageMutation.reset();
    setNotice("");
    setInline(null);
    setPhotoNotice(undefined);
    setEditor(next);
  }
  function writeInline(key: string, send: () => Promise<unknown>) {
    setInline(key);
    mutation.mutate(send);
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
        (!(error instanceof ApiError) ||
          error.status >= 500 ||
          error.code === "CATEGORIES_CHANGED" ||
          error.code === "CATEGORY_ITEMS_CHANGED") && (
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
  const inlineResult = (key: string) =>
    !editor && inline === key
      ? (feedback ?? (notice && <Notice tone="success">{notice}</Notice>))
      : null;
  const photoError = imageMutation.isError ? failure(imageMutation.error) : null;
  const menu = query.data;
  // A removed selection falls back to the full menu without discarding an open form.
  const selected = menu?.categories.find((value) => value.id === categoryId);
  const items = menu?.items.filter((item) => !selected || item.categoryId === selected.id) ?? [];
  // Lists every group in its new order, so a repeated or late request changes nothing more.
  function moveGroup(index: number, by: number) {
    const ids = menu!.optionGroups.map((group) => group.id);
    const moved = ids[index];
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    writeInline(moved, () => reorderOptionGroups(ids));
  }
  function moveCategory(index: number, by: number) {
    if (busy || editing || !menu) return;
    const ids = menu.categories.map((category) => category.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    writeInline("categories", () => reorderCategories(ids));
  }
  // The photo section follows the live menu, unlike the form fields, which keep their snapshot.
  function photo(itemId: string) {
    const item = menu?.items.find((value) => value.id === itemId);
    return (
      item && (
        <ItemImageSection
          item={item}
          busy={busy}
          error={photoError}
          notice={photoNotice && <Notice tone={photoNotice.tone}>{photoNotice.text}</Notice>}
          upload={(file) => imageMutation.mutate(() => uploadItemImage(item.id, file))}
          clear={() => {
            imageMutation.reset();
            setPhotoNotice(undefined);
          }}
          remove={(done) =>
            imageMutation.mutate(() => deleteItemImage(item.id), { onSuccess: done })
          }
        />
      )
    );
  }
  return (
    <div>
      <PageHeader
        title={m.title}
        description={owner ? m.ownerHint : m.staffHint}
        back={isTab ? undefined : { to: "/staff", label: staffMessages[language].home }}
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
        {notice && inline === null && <Notice tone="success">{notice}</Notice>}
        {query.isError && <Notice tone="error">{m.readError}</Notice>}
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
              toggle={(group, option) =>
                writeInline(group.id, () => setOptionAvailability(option.id, !option.isAvailable))
              }
              result={inlineResult}
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
            {owner && (
              <CategoryOrder
                menu={menu}
                disabled={busy || editing || query.isFetching || query.isError}
                move={moveCategory}
              />
            )}
            {inlineResult("categories")}
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
                <h2 className="min-w-0 text-lg font-semibold wrap-break-word">
                  {displayName(selected, menu.defaultLanguage, language).text}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {items.length >= 2 && (
                    <Button
                      variant="outline"
                      disabled={busy || editing || query.isFetching || query.isError}
                      onClick={() =>
                        open({
                          kind: "item-order",
                          snapshot: {
                            category: selected,
                            defaultLanguage: menu.defaultLanguage,
                            items,
                          },
                        })
                      }
                    >
                      <ArrowDownUp />
                      {m.sortItems}
                    </Button>
                  )}
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
            <MenuDishList
              menu={menu}
              items={items}
              owner={owner}
              disabled={busy || editing}
              open={open}
              toggleAvailability={(item) =>
                writeInline(item.id, () => setItemAvailability(item.id, !item.isAvailable))
              }
              inlineResult={inlineResult}
            />
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
                save={(language) => writeInline("language", () => setDefaultLanguage(language))}
              />
              {inlineResult("language")}
            </section>
          </TabsContent>
        </Tabs>
      )}
      <MenuEditorSheet
        menu={menu}
        editor={editor}
        busy={busy}
        open={open}
        cancel={cancel}
        save={mutation.mutate}
        error={mutation.error}
        feedback={feedback}
        photo={photo}
      />
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
