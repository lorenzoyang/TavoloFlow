import { useSyncExternalStore } from "react";
import {
  readStaffLanguage,
  saveStaffLanguage,
  staffLanguageKey,
  type StaffLanguage,
} from "./staff-language";

// Merely touching localStorage throws when the browser blocks site data.
function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function read() {
  const local = storage();
  return local ? readStaffLanguage(local) : "zh";
}

let current = read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab of the same device switched language.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== staffLanguageKey && event.key !== null) return;
    current = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStaffLanguage(): StaffLanguage {
  return useSyncExternalStore(subscribe, () => current);
}

export function setStaffLanguage(language: StaffLanguage) {
  const local = storage();
  if (local) saveStaffLanguage(language, local);
  current = language;
  for (const listener of listeners) listener();
}
