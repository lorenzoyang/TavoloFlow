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
const root = /:root \{([^}]*)\}/.exec(css)![1];
const blocks = Object.fromEntries(
  [...css.matchAll(/\[data-theme="(\w+)"\] \{([^}]*)\}/g)].map((m) => [m[1], m[2]]),
);
const palettes = Object.fromEntries(
  THEMES.map((theme) => [theme, tokens(blocks[themeAttribute(theme) ?? ""] ?? root)]),
);
const states = ["success", "warning", "destructive"];

// OKLCH → linear sRGB using Björn Ottosson's OKLab matrices.
function linearRgb([l, c, h]: Oklch) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ].map((v) => Math.min(1, Math.max(0, v)));
}
function luminance(rgb: number[]) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrastRatio(a: number, b: number) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function contrast(x: Oklch, y: Oklch) {
  return contrastRatio(luminance(linearRgb(x)), luminance(linearRgb(y)));
}
function toSrgb(v: number) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}
function toLinear(v: number) {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
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

test("theme presets share state colours and geometry", () => {
  for (const [name, body] of Object.entries(blocks)) {
    const properties = [...body.matchAll(/--([\w-]+):/g)].map((m) => m[1]);
    for (const property of properties)
      assert.ok(
        !states.some((s) => property.startsWith(s)) && property !== "radius",
        `${name} redefines --${property}`,
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
      assert.ok(properties.includes(token), `${name} keeps the default --${token}`);
  }
});

test("every theme keeps text readable (WCAG AA) on its surfaces", () => {
  for (const [theme, overrides] of Object.entries(palettes)) {
    const p = { ...tokens(root), ...overrides };
    const pairs: [string, string, number][] = [
      ["foreground", "background", 4.5],
      ["foreground", "secondary", 4.5],
      ["foreground", "accent", 4.5],
      ["card-foreground", "card", 4.5],
      ["popover-foreground", "popover", 4.5],
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
      ["muted-foreground", "accent", 4.5],
      ["primary", "accent", 3],
    ];
    for (const [text, surface, minimum] of pairs) {
      const ratio = contrast(p[text], p[surface]);
      assert.ok(ratio >= minimum, `${theme}: ${text} on ${surface} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("every banner has a distinct pattern and trim", () => {
  for (const property of ["pattern", "trim"]) {
    const values = [root, ...Object.values(blocks)].map(
      (body) => new RegExp(`--restaurant-banner-${property}:\\s*([^;]+);`).exec(body)?.[1],
    );
    assert.ok(values.every(Boolean), `missing banner ${property}`);
    assert.equal(new Set(values).size, THEMES.length, `shared banner ${property}`);
  }
});

test("banner text, controls and focus have contrast at both ends and over the artwork", () => {
  for (const theme of THEMES) {
    const palette = palettes[theme];
    const source = blocks[themeAttribute(theme) ?? ""] ?? root;
    const opacity = Number(/--restaurant-banner-pattern-opacity:\s*([\d.]+);/.exec(source)?.[1]);
    assert.ok(opacity > 0 && opacity < 1, `${theme}: invalid artwork opacity`);
    const ink = linearRgb(palette["restaurant-banner-ink"]).map(toSrgb);
    for (const stop of ["start", "end"]) {
      const base = linearRgb(palette[`restaurant-banner-${stop}`]);
      // The mask and transparent parts can only reduce coverage below this maximum.
      const withInk = base.map((v, i) => toLinear(toSrgb(v) * (1 - opacity) + ink[i] * opacity));
      for (const surface of [base, withInk]) {
        for (const [property, minimum] of [
          ["text", 4.5],
          ["detail", 4.5],
          ["edge", 3],
        ] as const) {
          const fg = luminance(linearRgb(palette[`restaurant-banner-${property}`]));
          const ratio = contrastRatio(fg, luminance(surface));
          assert.ok(
            ratio >= minimum,
            `${theme}: banner ${property} at ${stop} is ${ratio.toFixed(2)}:1`,
          );
        }
      }
    }
  }
});

test("no theme's primary action can be mistaken for a state colour", () => {
  // Keep each primary at least 0.05 away from every state colour in OKLab.
  const shared = tokens(root);
  for (const [theme, p] of Object.entries(palettes))
    for (const state of states)
      assert.ok(
        distance(p.primary, shared[state]) >= 0.05,
        `${theme}: primary is too close to ${state}`,
      );
});
