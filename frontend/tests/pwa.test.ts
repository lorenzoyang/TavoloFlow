import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type Icon = { src: string; sizes: string; purpose?: string };

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
const manifest = JSON.parse(read("public/staff.webmanifest").toString());
// A PNG's IHDR chunk stores the width and height right after the 8-byte signature and chunk header.
const pngSize = (path: string) => {
  const png = read(path);
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
};

test("the staff app's identity, start page and scope are /staff without a trailing slash", () => {
  // The router drops trailing slashes, so the home page is /staff; a /staff/ scope would leave it
  // outside the installed app.
  for (const key of ["id", "start_url", "scope"]) assert.equal(manifest[key], "/staff");
  assert.equal(manifest.display, "standalone");
});

test("every manifest icon exists at its declared size, and iOS has a 180px touch icon", () => {
  const icons: Icon[] = manifest.icons;
  for (const icon of icons) assert.equal(pngSize(`public${icon.src}`), icon.sizes);
  // Chromium requires 192px and 512px icons to install; Android launchers mask the maskable one.
  assert.deepEqual(
    icons.filter((icon) => (icon.purpose ?? "any") === "any").map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
  assert.ok(icons.some((icon) => icon.purpose === "maskable"));
  assert.equal(pngSize("public/apple-touch-icon.png"), "180x180");
});

test("index.html links no manifest, so guests on /q/* are never offered an installation", () => {
  const html = read("index.html").toString();
  assert.doesNotMatch(html, /rel="manifest"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon.png" \/>/);
});
