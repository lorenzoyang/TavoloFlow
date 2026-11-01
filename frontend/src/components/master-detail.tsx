import { createContext, useContext, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMediaQuery, WIDE_SCREEN } from "@/lib/useMediaQuery";

const DetailColumn = createContext(false);

// A list with the selected record's detail. Wide screens show the detail as a non-modal column beside
// the list, so the list stays usable and visible to assistive technology; narrower screens open it as a
// full-height sheet that Escape, the close button or (with URL-driven selection) Back closes.
export function MasterDetail({
  open,
  title,
  onClose,
  detail,
  closeLabel = "关闭",
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  detail: ReactNode;
  closeLabel?: string;
  children: ReactNode;
}) {
  const wide = useMediaQuery(WIDE_SCREEN);
  const insideColumn = useContext(DetailColumn);
  // Opening the sheet focuses its close button rather than the first field inside the detail.
  const close = useRef<HTMLButtonElement>(null);
  return (
    <div
      className={cn(
        "grid items-start gap-6",
        wide && open && !insideColumn && "grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]",
      )}
    >
      {/* Keep the page in the same React position across breakpoints and service changes. Nested
            details stack in the remaining column instead of squeezing their list down to zero. */}
      <div className="min-w-0">
        <DetailColumn value={insideColumn || (wide && open)}>{children}</DetailColumn>
      </div>
      {wide && open && (
        <aside
          aria-label={title}
          className={cn(
            "min-w-0 rounded-2xl border bg-card p-5 shadow-xs",
            !insideColumn && "sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto",
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold wrap-break-word">{title}</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label={closeLabel}
              className="-mt-2 -mr-2"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
          {detail}
        </aside>
      )}
      {!wide && (
        <Sheet
          open={open}
          onOpenChange={(next) => {
            if (!next) onClose();
          }}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            initialFocus={close}
            className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
          >
            <SheetHeader className="flex-row items-start justify-between gap-3 border-b pt-[max(1rem,env(safe-area-inset-top))]">
              <SheetTitle className="text-lg font-semibold wrap-break-word">{title}</SheetTitle>
              <SheetClose
                ref={close}
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={closeLabel}
                    className="-mt-2 -mr-2"
                  />
                }
              >
                <X />
              </SheetClose>
            </SheetHeader>
            <div className="pb-safe flex-1 overflow-y-auto p-4">{detail}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
