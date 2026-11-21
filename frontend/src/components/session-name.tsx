import { cn } from "@/lib/utils";
import { sessionDetail, sessionTitle, type SessionNaming } from "@/lib/session-label";
import { useStaffLanguage } from "@/lib/useStaffLanguage";

// A session's name inside headings and cards. The title wraps like a table label; an online order adds
// a smaller line with the customer name, truncated so a long name never widens a 360px layout, and the
// estimated time. Cards holding it need min-w-0, or the full name still sizes their grid track.
export function SessionName({
  session,
  className,
}: {
  session: SessionNaming;
  className?: string;
}) {
  const language = useStaffLanguage();
  const title = sessionTitle(session, language);
  const detail = sessionDetail(session, language);
  return (
    <span className={cn("block min-w-0", className)}>
      <span className="block wrap-break-word">{title}</span>
      {detail &&
        (session.online?.requestedPickupAt ? (
          <span className="block min-w-0 text-sm">
            <span className="block font-semibold tabular-nums">{detail.time}</span>
            {detail.name && <span className="block truncate font-medium">{detail.name}</span>}
          </span>
        ) : (
          <span className="flex min-w-0 items-baseline gap-2 text-[max(0.6em,0.875rem)]">
            {detail.name && <span className="min-w-0 truncate">{detail.name}</span>}
            <span className="shrink-0 tabular-nums">{detail.time}</span>
          </span>
        ))}
    </span>
  );
}
