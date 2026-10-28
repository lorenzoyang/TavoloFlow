import { useQuery } from "@tanstack/react-query";
import { Notice } from "@/components/notice";
import type { AccountScope } from "@/features/accounts/api";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { floorQuery } from "./api";
import { diningMessages } from "./messages";

// New restaurants stay SUSPENDED until the platform enables them, and guests only see a neutral
// notice, so store pages say why scanning cannot order. The floor read carries the status.
export function ServiceSuspendedNotice({ account }: { account: AccountScope }) {
  const floor = useQuery(floorQuery(account));
  const m = diningMessages[useStaffLanguage()];
  if (floor.data?.serviceStatus !== "SUSPENDED") return null;
  return <Notice tone="warning">{m.suspendedHome}</Notice>;
}
