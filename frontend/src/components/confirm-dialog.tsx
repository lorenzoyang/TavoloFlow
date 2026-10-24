import type { ReactNode, RefObject } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

// The human confirmation in front of an irreversible or money-related write. The dialog stays open
// while the request runs; the caller closes it by clearing its own confirmation state.
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "取消",
  tone = "default",
  busy = false,
  confirmDisabled = false,
  initialFocus,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
  busy?: boolean;
  confirmDisabled?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent initialFocus={initialFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold wrap-break-word">
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="leading-6">{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={busy || confirmDisabled}
            aria-busy={busy}
            onClick={onConfirm}
          >
            {busy && <Spinner />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
