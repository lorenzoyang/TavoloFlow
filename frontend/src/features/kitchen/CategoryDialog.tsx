import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { displayName } from "@/lib/language";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { kitchenMessages } from "./messages";
import type { useKitchen } from "./useKitchen";

// The categories this kitchen screen shows: checked means shown. Each change is saved at once, and only
// categories still on the menu are kept, so a deleted one drops out of the setting.
export function CategoryDialog({ model }: { model: ReturnType<typeof useKitchen> }) {
  const language = useStaffLanguage();
  const m = kitchenMessages[language];
  const menu = model.menu.data;
  const categories = menu?.categories ?? [];
  const hidden = categories.filter((category) => model.hidden.includes(category.id));
  const shown = categories.length - hidden.length;
  const toggle = (id: string, show: boolean) => {
    const ids = hidden.map((category) => category.id);
    model.setHidden(show ? ids.filter((x) => x !== id) : [...ids, id]);
  };
  return (
    <Dialog open={model.choosing} onOpenChange={(open) => model.setChoosing(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{m.categoriesTitle}</DialogTitle>
          <DialogDescription>{m.categoriesHint}</DialogDescription>
        </DialogHeader>
        {menu ? (
          categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.noCategories}</p>
          ) : (
            <ul className="max-h-[55dvh] overflow-y-auto">
              {categories.map((category) => {
                const name = displayName(category, menu.defaultLanguage, language);
                const checked = !hidden.includes(category);
                return (
                  <li key={category.id}>
                    <label className="flex min-h-11 items-center gap-3">
                      <Checkbox
                        checked={checked}
                        // A screen that hides everything would look like a quiet kitchen.
                        disabled={checked && shown === 1}
                        onCheckedChange={(next) => toggle(category.id, next)}
                      />
                      <span lang={name.language} className="min-w-0 wrap-break-word">
                        {name.text}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )
        ) : model.menu.isError ? (
          <Notice tone="error">{m.categoriesError}</Notice>
        ) : (
          <LoadingState label={m.categoriesLoading} />
        )}
        {shown === 1 && categories.length > 1 && (
          <p className="text-sm text-muted-foreground">{m.keepOne}</p>
        )}
        <DialogFooter>
          {model.hidden.length > 0 && (
            <Button variant="outline" onClick={() => model.setHidden([])}>
              {m.showAll}
            </Button>
          )}
          <Button onClick={() => model.setChoosing(false)}>{m.finish}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
