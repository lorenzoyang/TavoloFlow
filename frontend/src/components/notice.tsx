import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const tones = {
  info: { variant: "default", Icon: Info },
  success: { variant: "success", Icon: CircleCheck },
  warning: { variant: "warning", Icon: TriangleAlert },
  error: { variant: "destructive", Icon: CircleAlert },
} as const;

export type NoticeTone = keyof typeof tones;

// Inline feedback for every page. Errors interrupt assistive technology; other tones are polite.
export function Notice({
  tone = "info",
  children,
  action,
  className,
}: {
  tone?: NoticeTone;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { variant, Icon } = tones[tone];
  return (
    <Alert variant={variant} role={tone === "error" ? "alert" : "status"} className={className}>
      <Icon aria-hidden="true" />
      <AlertDescription className="leading-6">
        {children}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </AlertDescription>
    </Alert>
  );
}
