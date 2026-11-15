import { createContext } from "react";
import type { usePushSync } from "./usePushSync";

export const PushContext = createContext<ReturnType<typeof usePushSync> | null>(null);
