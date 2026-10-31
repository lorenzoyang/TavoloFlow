// The server's rules for the public phone (InputRules.NormalizePhone) and the online menu link name
// (InputRules.IsSlug), checked in the browser first. The server checks them again.

// An optional + and 6–15 digits once whitespace is removed; returns the stored form, or null.
export function normalizePhone(value: string): string | null {
  const compact = value.replace(/\s+/g, "");
  return /^\+?[0-9]{6,15}$/.test(compact) ? compact : null;
}

// 3–40 lowercase letters, digits and hyphens, with no hyphen at either end.
export function isSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(value);
}

// A suggested link name from the restaurant's name: accents dropped, every other run of characters
// becomes one hyphen. Names without Latin letters or digits get no suggestion.
export function suggestSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return isSlug(slug) ? slug : "";
}
