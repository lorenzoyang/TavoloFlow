import type { ReactNode } from "react";
import type { OnlineSettings } from "./api";

export type SettingsWrite = (signal: AbortSignal) => Promise<OnlineSettings>;
// done runs after a current success; settled after every attempt, so a dialog can close either way.
export type SendSettings = (
  request: SettingsWrite,
  done?: () => void,
  settled?: () => void,
) => void;

export type SettingsCardProps = {
  settings: OnlineSettings;
  busy: boolean;
  send: SendSettings;
  feedback: ReactNode;
  edited: () => void;
};
