import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useClosingContent } from "@/lib/useClosingContent";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import {
  reorderItems,
  saveCategory,
  saveItem,
  saveOptionGroup,
  type Category,
  type Menu,
  type MenuItem,
  type OptionGroup,
} from "./api";
import { CategoryForm, ItemForm } from "./MenuForms";
import { ItemOrderForm, type ItemOrderSnapshot } from "./ItemOrderForm";
import { menuMessages } from "./messages";
import { OptionGroupForm } from "./OptionGroupForm";
import { TemplatePicker } from "./OptionGroups";
import type { OptionTemplate } from "./option-templates";
import type { ReactNode } from "react";

export type MenuEditor =
  | { kind: "category"; value?: Category }
  | { kind: "item"; value?: MenuItem; categoryId: string }
  | { kind: "item-order"; snapshot: ItemOrderSnapshot }
  // A new option group starts from a template (or a blank form).
  | { kind: "templates" }
  | { kind: "group"; value?: OptionGroup; template?: OptionTemplate; copyOf?: OptionGroup }
  | {
      kind: "delete";
      resource: "categories" | "items" | "option-groups";
      id: string;
      name: string;
      // How many dishes a deleted option group leaves.
      dishes?: number;
    };

function editorTitle(editor: MenuEditor | null, m: (typeof menuMessages)["en"]) {
  switch (editor?.kind) {
    case "category":
      return editor.value ? m.editCategory : m.addCategory;
    case "templates":
      return m.addOptionGroup;
    case "group":
      return editor.value ? m.editOptionGroup : m.addOptionGroup;
    case "item-order":
      return m.sortItems;
    case "item":
      return editor.value ? m.editItem : m.addItem;
    default:
      return m.addItem;
  }
}

export function MenuEditorSheet({
  menu,
  editor,
  busy,
  open,
  cancel,
  save,
  error,
  feedback,
  photo,
}: {
  menu?: Menu;
  editor: MenuEditor | null;
  busy: boolean;
  open: (editor: MenuEditor) => void;
  cancel: () => void;
  save: (request: () => Promise<unknown>) => void;
  error: unknown;
  feedback: ReactNode;
  // The photo section of an existing dish; it follows the live menu, unlike the form fields.
  photo: (itemId: string) => ReactNode;
}) {
  const m = menuMessages[useStaffLanguage()];
  const sheetOpen = editor !== null && editor.kind !== "delete";
  // The page clears its editor as soon as a save succeeds; the sheet keeps showing that editor while
  // it slides out instead of emptying first.
  const current = useClosingContent(sheetOpen, editor);
  return (
    <Sheet
      open={sheetOpen}
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
          <SheetTitle className="text-lg font-semibold">{editorTitle(current, m)}</SheetTitle>
          <SheetClose
            disabled={busy}
            render={<Button variant="ghost" size="icon" aria-label={m.cancel} className="-mr-2" />}
          >
            <X />
          </SheetClose>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pt-4">
          {current?.kind === "item-order" && (
            <ItemOrderForm
              initial={current.snapshot}
              busy={busy}
              save={(ids) => save(() => reorderItems(current.snapshot.category.id, ids))}
              cancel={cancel}
              feedback={feedback}
            />
          )}
          {menu && current?.kind === "category" && (
            <CategoryForm
              key={`category-${current.value?.id ?? "new"}`}
              initial={current.value}
              busy={busy}
              error={error}
              cancel={cancel}
              save={(body) => save(() => saveCategory(current.value?.id, body))}
              feedback={feedback}
            />
          )}
          {menu && current?.kind === "templates" && (
            <TemplatePicker
              menu={menu}
              choose={(template) => open({ kind: "group", template })}
              copy={(group) => open({ kind: "group", copyOf: group })}
            />
          )}
          {menu && current?.kind === "group" && (
            <OptionGroupForm
              key={`group-${current.value?.id ?? current.template?.key ?? (current.copyOf ? `copy-${current.copyOf.id}` : "new")}`}
              initial={current.value}
              copyOf={current.copyOf}
              template={current.template}
              menu={menu}
              busy={busy}
              error={error}
              cancel={cancel}
              save={(body) => save(() => saveOptionGroup(current.value?.id, body))}
              feedback={feedback}
            />
          )}
          {current?.kind === "item" && current.value && photo(current.value.id)}
          {menu && current?.kind === "item" && !current.value && (
            <FieldDescription className="mb-5">{m.photoAfterCreate}</FieldDescription>
          )}
          {menu && current?.kind === "item" && (
            <ItemForm
              key={`item-${current.value?.id ?? "new"}`}
              initial={current.value}
              menu={menu}
              categoryId={current.categoryId}
              busy={busy}
              error={error}
              cancel={cancel}
              save={(body) => save(() => saveItem(current.value?.id, body))}
              feedback={feedback}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
