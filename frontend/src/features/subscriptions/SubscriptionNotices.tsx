import { useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Notice } from "@/components/notice";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AccountScope } from "@/features/accounts/api";
import { errorMessage } from "@/lib/api";
import { formatCalendarDate } from "@/lib/format";
import { useOperations } from "@/lib/useOperations";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import {
  acknowledgeOwnerNotices,
  acknowledgePlatformNotices,
  readOwnerNotices,
  readPlatformNotices,
} from "./api";
import { useSubscriptionQuery } from "./queries";
import { PeriodDetails } from "./SubscriptionViews";
import type { SubscriptionNotice } from "./state";
import { noticeMessages } from "./messages";

export function OwnerSubscriptionNotices({ account }: { account: AccountScope }) {
  return (
    <SubscriptionNotices
      queryKey={["subscription", account.restaurantId, account.userId, "notices"]}
      read={readOwnerNotices}
      acknowledge={acknowledgeOwnerNotices}
    />
  );
}

export function PlatformSubscriptionNotices({ userId }: { userId: string }) {
  return (
    <SubscriptionNotices
      queryKey={["platform", "subscription-notices", userId]}
      read={readPlatformNotices}
      acknowledge={acknowledgePlatformNotices}
    />
  );
}

function SubscriptionNotices({
  queryKey,
  read,
  acknowledge,
}: {
  queryKey: QueryKey;
  read: (signal: AbortSignal) => Promise<SubscriptionNotice[]>;
  acknowledge: (ids: string[], signal: AbortSignal) => Promise<void>;
}) {
  const language = useStaffLanguage();
  const m = noticeMessages[language];
  const client = useQueryClient();
  const { data, isError, stale } = useSubscriptionQuery(queryKey, read);
  const ops = useOperations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!data?.length) return;
    const operation = ops.start("acknowledge");
    if (!operation) return;
    const ids = data.map((notice) => notice.id);
    setBusy(true);
    setError(null);
    try {
      await acknowledge(ids, operation.signal);
      if (!operation.isCurrent()) return;
      await client.cancelQueries({ queryKey, exact: true });
      if (operation.isCurrent()) {
        client.setQueryData<SubscriptionNotice[]>(queryKey, (current) =>
          current?.filter((notice) => !ids.includes(notice.id)),
        );
      }
    } catch (failure) {
      if (operation.isCurrent()) setError(errorMessage(failure, m.saveError, language));
    } finally {
      if (operation.finish()) {
        setBusy(false);
        void client.invalidateQueries({ queryKey, exact: true });
      }
    }
  }

  if (!data?.length && isError)
    return (
      <Notice tone="error" className="mb-4">
        {m.readError}
      </Notice>
    );
  return (
    <AlertDialog open={!!data?.length}>
      <AlertDialogContent className="max-h-[85dvh] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <AlertDialogHeader>
          <AlertDialogTitle>{m.title}</AlertDialogTitle>
        </AlertDialogHeader>
        <ul aria-label={m.title} className="min-w-0 space-y-3 overflow-y-auto overscroll-contain">
          {data?.map((notice) => (
            <li key={notice.id} className="min-w-0 space-y-2 rounded-xl border p-3 wrap-break-word">
              <p className="font-semibold">{notice.restaurantName}</p>
              <p className="text-sm font-medium">
                {m.kinds[notice.kind]}
                {notice.deadline && <> · {formatCalendarDate(notice.deadline, language)}</>}
              </p>
              {notice.awaitingPayment ? (
                <p className="text-sm">{m.awaitingPayment}</p>
              ) : notice.periodPaid !== null ? (
                <p className="text-sm">{notice.periodPaid ? m.currentPaid : m.currentUnpaid}</p>
              ) : null}
              {notice.change?.before && (
                <div className="min-w-0 space-y-1 border-b pb-2">
                  <p className="text-sm font-medium">{m.previous}</p>
                  <PeriodDetails period={notice.change.before} />
                </div>
              )}
              {notice.change && <PeriodDetails period={notice.change.after} />}
              {notice.reason && <p className="text-sm whitespace-pre-wrap">{notice.reason}</p>}
            </li>
          ))}
        </ul>
        <AlertDialogFooter className="sm:flex-col">
          {error && <Notice tone="error">{error}</Notice>}
          {stale && !error && (
            <p className="text-sm" role="status">
              {m.refreshing}
            </p>
          )}
          <Button
            className="w-full sm:w-auto sm:self-end"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void confirm()}
          >
            {m.acknowledge}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
