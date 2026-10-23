import assert from "node:assert/strict";
import { test } from "node:test";
import { displayName, type Language, type Names } from "../src/lib/language.ts";

const names: Names = { nameZh: "炒饭", nameIt: "Riso", nameEn: "Rice" };

test("the restaurant preference wins when no viewer language is selected", () => {
  for (const [language, text] of [
    ["zh", "炒饭"],
    ["it", "Riso"],
    ["en", "Rice"],
  ] as const) {
    assert.deepEqual(displayName(names, language), { language, text });
  }
});

test("a missing default falls back to Italian, then Chinese, then English", () => {
  assert.deepEqual(displayName({ ...names, nameEn: null }, "en"), { language: "it", text: "Riso" });
  assert.deepEqual(displayName({ ...names, nameIt: null }, "it"), { language: "zh", text: "炒饭" });
  assert.deepEqual(displayName({ ...names, nameIt: null, nameZh: null }, "it"), {
    language: "en",
    text: "Rice",
  });
});

test("each single translation works with every default and a repeated viewer choice", () => {
  const translations: [Names, Language, string][] = [
    [{ nameZh: "炒饭", nameIt: null, nameEn: null }, "zh", "炒饭"],
    [{ nameZh: null, nameIt: "Riso", nameEn: null }, "it", "Riso"],
    [{ nameZh: null, nameIt: null, nameEn: "Rice" }, "en", "Rice"],
  ];
  for (const [content, language, text] of translations) {
    for (const preference of ["it", "zh", "en"] as const) {
      assert.deepEqual(displayName(content, preference, preference), { language, text });
    }
  }
});

test("blank translations are skipped and adding the preferred translation changes the result", () => {
  const content = { ...names, nameIt: " \t " };
  assert.equal(displayName(content, "it").text, "炒饭");
  assert.equal(displayName({ ...content, nameIt: "Riso" }, "it").text, "Riso");
  assert.equal(content.nameIt, " \t "); // Resolving a name does not mutate content.
});

test("the Chinese staff interface explicitly overrides the default, then follows it", () => {
  assert.equal(displayName(names, "it", "zh").text, "炒饭");
  assert.equal(displayName({ ...names, nameZh: null }, "en", "zh").text, "Rice");
  assert.equal(displayName({ ...names, nameZh: null, nameEn: null }, "en", "zh").text, "Riso");
});
