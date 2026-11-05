import assert from "node:assert/strict";
import { test } from "node:test";
import {
  languageStorageKey,
  readLanguage,
  saveLanguage,
  selectedLanguage,
} from "../src/features/public-menu/language.ts";
import { publicMenuUrl, isLocalOnlyUrl } from "../src/features/tables/qr-url.ts";

test("guest language uses the owner's preference unless a valid explicit choice exists", () => {
  assert.equal(selectedLanguage(null, "it"), "it");
  assert.equal(selectedLanguage("fr", "zh"), "zh");
  assert.equal(selectedLanguage("en", "it"), "en");
  assert.equal(selectedLanguage(null, "en"), "en");
});

test("guest language is stored per restaurant and storage failures do not block browsing", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  saveLanguage("first", "zh", storage);
  saveLanguage("other", "en", storage);
  assert.equal(readLanguage("first", storage), "zh");
  assert.equal(readLanguage("other", storage), "en");
  assert.equal(readLanguage("new", storage), null);
  values.set(languageStorageKey("first"), "malformed");
  assert.equal(readLanguage("first", storage), null);
  const unavailable = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readLanguage("first", unavailable), null);
  assert.doesNotThrow(() => saveLanguage("first", "it", unavailable));
});

test("QR URL uses the configured origin or current origin and retains the fixed token", () => {
  assert.equal(
    publicMenuUrl("/q/fixed_-123", "http://localhost:5173"),
    "http://localhost:5173/q/fixed_-123",
  );
  assert.equal(
    publicMenuUrl("/q/fixed", "http://localhost:5173", " https://menu.example.com/ "),
    "https://menu.example.com/q/fixed",
  );
  assert.equal(
    publicMenuUrl("/q/fixed_-123", "http://localhost:5173", "https://app.example.com"),
    "https://app.example.com/q/fixed_-123",
  );
  assert.equal(
    publicMenuUrl("/q/fixed", "http://192.168.1.5:5173", " "),
    "http://192.168.1.5:5173/q/fixed",
  );
});

test("invalid QR origins and paths are rejected instead of silently generating a different destination", () => {
  for (const origin of [
    "javascript:alert(1)",
    "ftp://example.com",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com/?x=1",
    "https://example.com/#x",
    "not-a-url",
  ]) {
    assert.throws(() => publicMenuUrl("/q/token", "http://localhost:5173", origin));
  }
  for (const path of [
    "//evil.example/q/token",
    "/staff",
    "/q/../other",
    "/q/token?x=1",
    "/q/",
    `/q/${"x".repeat(129)}`,
  ]) {
    assert.throws(() => publicMenuUrl(path, "https://menu.example.com"));
  }
});

test("local-only QR links can be distinguished from phone-reachable addresses", () => {
  for (const host of ["localhost", "foo.localhost", "127.0.0.1", "[::1]", "0.0.0.0"])
    assert.equal(isLocalOnlyUrl(`http://${host}:5173/q/token`), true);
  assert.equal(isLocalOnlyUrl("http://192.168.1.5:5173/q/token"), false);
  assert.equal(isLocalOnlyUrl("https://menu.example.com/q/token"), false);
  assert.equal(isLocalOnlyUrl("https://app.example.com/q/token"), false);
});
