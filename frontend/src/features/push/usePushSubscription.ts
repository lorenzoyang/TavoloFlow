import { useContext } from "react";
import { PushContext } from "./context";

export function usePushSubscription() {
  const push = useContext(PushContext);
  if (!push) throw new Error("Push controls require an app layout.");
  return push;
}
