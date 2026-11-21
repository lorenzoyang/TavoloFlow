import type { ReactNode } from "react";
import type { AppScope } from "@/features/accounts/useInstallApp";
import type { PlatformIdentity } from "@/features/platform/identity";
import type { CurrentAccount } from "@/features/accounts/api";
import { PushContext } from "./context";
import { usePushSync } from "./usePushSync";

export function PushProvider({
  account,
  scope,
  children,
}: {
  account: CurrentAccount | PlatformIdentity | null | undefined;
  scope?: AppScope;
  children: ReactNode;
}) {
  const push = usePushSync(account, scope);
  return <PushContext.Provider value={push}>{children}</PushContext.Provider>;
}
