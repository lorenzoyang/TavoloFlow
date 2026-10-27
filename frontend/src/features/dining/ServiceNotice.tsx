import { useQuery } from "@tanstack/react-query";
import { Notice } from "@/components/notice";
import type { AccountScope } from "@/features/accounts/api";
import { floorQuery } from "./api";

// New restaurants stay SUSPENDED until the platform enables them, and guests only see a neutral
// notice, so store pages say why scanning cannot order. The floor read carries the status.
export function ServiceSuspendedNotice({ account }: { account: AccountScope }) {
  const floor = useQuery(floorQuery(account));
  if (floor.data?.serviceStatus !== "SUSPENDED") return null;
  return (
    <Notice tone="warning">
      餐厅服务尚未由平台启用或已被暂停：暂不能开桌，顾客扫码只能浏览菜单、不能点餐。如需启用，请联系平台管理员。
    </Notice>
  );
}
