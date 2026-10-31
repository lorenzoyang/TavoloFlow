import { formatTime } from "@/lib/format";
import type { StaffLanguage } from "@/lib/staff-language";
import { staffMessages, visitTitle, type VisitLabel } from "@/lib/staff-messages";

// A visit's heading: its table, or the pickup number with the guest's name and expected time beside it in
// smaller type. The number identifies the order; when space runs out the name and time wrap below it, and
// a name wider than the whole line is truncated, so it never pushes a 360px card wider.
export function VisitTitle({ visit, language }: { visit: VisitLabel; language: StaffLanguage }) {
  if (!visit.pickup) return <>{visitTitle(visit, language)}</>;
  return (
    <span className="inline-flex max-w-full min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="shrink-0">
        {staffMessages[language].pickup} #{visit.pickup.number}
      </span>
      <span className="flex max-w-full min-w-0 items-baseline gap-1.5 text-[0.7em] font-medium text-muted-foreground">
        <span className="min-w-0 truncate">{visit.pickup.customerName}</span>
        <span className="shrink-0 tabular-nums">
          · {formatTime(visit.pickup.estimatedReadyAt, language)}
        </span>
      </span>
    </span>
  );
}
