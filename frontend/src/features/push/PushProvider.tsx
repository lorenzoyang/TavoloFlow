import type { ReactNode } from "react";
import type { CurrentAccount } from "@/features/accounts/api";
import { PushContext } from "./context";
import { usePushSync } from "./usePushSync";

export function PushProvider({
  account,
  children,
}: {
  account: CurrentAccount | null | undefined;
  children: ReactNode;
}) {
  const push = usePushSync(account);
  return <PushContext.Provider value={push}>{children}</PushContext.Provider>;
}
