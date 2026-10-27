import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_THEME, THEMES, themeAttribute } from "../src/lib/theme.ts";

type Oklch = [number, number, number];

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const tokens = (body: string) =>
  Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)].map((m) => [
      m[1],
      [Number(m[2]), Number(m[3]), Number(m[4])] as Oklch,
    ]),
  );
const root = tokens(/:root \{([^}]*)\}/.exec(css)![1]);
const blocks = Object.fromEntries(
  [...css.matchAll(/\[data-theme="(\w+)"\] \{([^}]*)\}/g)].map((m) => [m[1], tokens(m[2])]),
);
const palettes = Object.fromEntries(
  THEMES.map((theme) => [theme, { ...root, ...blocks[themeAttribute(theme) ?? ""] }]),
);
const states = ["success", "warning", "destructive"];

// OKLCH → linear sRGB (Björn Ottosson's OKLab matrices), then WCAG relative luminance.
function luminance([l, c, h]: Oklch) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ].map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(x: Oklch, y: Oklch) {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}
function distance([l1, c1, h1]: Oklch, [l2, c2, h2]: Oklch) {
  const rad = Math.PI / 180;
  return Math.hypot(
    l1 - l2,
    c1 * Math.cos(h1 * rad) - c2 * Math.cos(h2 * rad),
    c1 * Math.sin(h1 * rad) - c2 * Math.sin(h2 * rad),
  );
}

test("each preset maps to exactly one data-theme block, and the default uses :root", () => {
  assert.equal(themeAttribute(DEFAULT_THEME), null);
  assert.deepEqual(
    Object.keys(blocks).sort(),
    THEMES.filter((t) => t !== DEFAULT_THEME)
      .map((t) => t.toLowerCase())
      .sort(),
  );
  for (const value of ["lacquer", "OCEAN", "", null, undefined, 1])
    assert.equal(themeAttribute(value), null);
  assert.equal(themeAttribute("TARO"), "taro");
});

test("themes replace the brand palette only, never the state colours or the radius", () => {
  for (const [name, block] of Object.entries(blocks)) {
    for (const token of Object.keys(block))
      assert.ok(
        !states.some((s) => token.startsWith(s)) && token !== "radius",
        `${name} redefines --${token}`,
      );
    for (const token of [
      "background",
      "foreground",
      "primary",
      "accent",
      "muted-foreground",
      "border",
      "ring",
    ])
      assert.ok(token in block, `${name} keeps the default --${token}`);
  }
});

test("every theme keeps text readable (WCAG AA) on its surfaces", () => {
  for (const [theme, p] of Object.entries(palettes)) {
    const pairs: [string, string, number][] = [
      ["foreground", "background", 4.5],
      ["foreground", "secondary", 4.5],
      ["foreground", "accent", 4.5],
      ["card-foreground", "card", 4.5],
      ["muted-foreground", "background", 4.5],
      ["muted-foreground", "muted", 4.5],
      ["muted-foreground", "card", 4.5],
      ["primary-foreground", "primary", 4.5],
      ["primary", "background", 4.5],
      ["primary", "card", 4.5],
      ["accent-foreground", "accent", 4.5],
      ["secondary-foreground", "secondary", 4.5],
      ["destructive", "background", 4.5],
      ["success", "background", 3],
    ];
    for (const [text, surface, minimum] of pairs) {
      const ratio = contrast(p[text], p[surface]);
      assert.ok(ratio >= minimum, `${theme}: ${text} on ${surface} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("no theme's primary action can be mistaken for a state colour", () => {
  // The default terracotta sits 0.055 from tomato in OKLab; no theme may come closer than that.
  for (const [theme, p] of Object.entries(palettes))
    for (const state of states)
      assert.ok(
        distance(p.primary, p[state]) >= 0.05,
        `${theme}: primary is too close to ${state}`,
      );
});
