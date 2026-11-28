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
import { staffMessages } from "@/lib/staff-messages";
import { useClosingContent } from "@/lib/useClosingContent";
import { useStaffLanguage } from "@/lib/useStaffLanguage";

type ConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  contentClassName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
  busy?: boolean;
  confirmDisabled?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
};

// The human confirmation in front of an irreversible or money-related write. The dialog stays open
// while the request runs; the caller closes it by clearing its own confirmation state, and the dialog
// keeps its last text while it fades out. Without a cancelLabel the button speaks the store/platform
// interface language; guest pages pass their own.
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, contentClassName, initialFocus, onConfirm, onCancel } = props;
  const fallbackCancel = staffMessages[useStaffLanguage()].cancel;
  // While it fades out, the dialog shows the text and state of its last open render.
  const {
    title,
    description,
    children,
    confirmLabel,
    cancelLabel,
    tone = "default",
    busy = false,
    confirmDisabled = false,
  } = useClosingContent(open, props);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent className={contentClassName} initialFocus={initialFocus}>
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
            {cancelLabel ?? fallbackCancel}
          </Button>
          {confirmLabel && (
            <Button
              variant={tone === "destructive" ? "destructive" : "default"}
              disabled={busy || confirmDisabled}
              aria-busy={busy}
              onClick={onConfirm}
            >
              {busy && <Spinner />}
              {confirmLabel}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
