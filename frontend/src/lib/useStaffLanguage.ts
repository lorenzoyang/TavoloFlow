import { useSyncExternalStore } from "react";
import type { Language } from "./language";
import { readStaffLanguage, saveStaffLanguage, staffLanguageKey } from "./staff-language";

// Merely touching localStorage throws when the browser blocks site data.
function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function read() {
  return readStaffLanguage(storage(), navigator.languages);
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

// The interface language of store and platform pages. Guest pages keep their own choice.
export function useStaffLanguage(): Language {
  return useSyncExternalStore(subscribe, () => current);
}

export function setStaffLanguage(language: Language) {
  const local = storage();
  if (local) saveStaffLanguage(language, local);
  current = language;
  for (const listener of listeners) listener();
}
