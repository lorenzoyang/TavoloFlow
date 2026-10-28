// The store pages (OWNER and STAFF) speak Chinese or Italian. The choice is a device preference, like
// the kitchen sound: shared tablets keep it for everyone, and without a stored choice pages use Chinese.
export type StaffLanguage = "zh" | "it";

export const STAFF_LANGUAGES: readonly StaffLanguage[] = ["zh", "it"];
export const staffLanguageKey = "tavoloflow:staff-language";

export function isStaffLanguage(value: unknown): value is StaffLanguage {
  return value === "zh" || value === "it";
}

export function readStaffLanguage(storage: Pick<Storage, "getItem">): StaffLanguage {
  try {
    const value = storage.getItem(staffLanguageKey);
    return isStaffLanguage(value) ? value : "zh";
  } catch {
    return "zh";
  }
}

export function saveStaffLanguage(language: StaffLanguage, storage: Pick<Storage, "setItem">) {
  try {
    storage.setItem(staffLanguageKey, language);
  } catch {
    /* The choice still applies to this page without storage. */
  }
}
