import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { readStaffLanguage } from "../src/lib/staff-language.ts";

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

type NavigationEvent = {
  request: { mode: string };
  respondWith: (response: Promise<Response>) => void;
};

async function offlineHtml() {
  const listeners = new Map<string, (event: NavigationEvent) => void>();
  runInNewContext(read("public/sw.js").toString(), {
    self: {
      addEventListener: (name: string, handler: (event: NavigationEvent) => void) =>
        listeners.set(name, handler),
    },
    Response,
    fetch: async () => {
      throw new Error("offline");
    },
  });
  let pending: Promise<Response> | undefined;
  listeners.get("fetch")!({
    request: { mode: "navigate" },
    respondWith: (response) => {
      pending = response;
    },
  });
  assert.ok(pending);
  const response = await pending;
  assert.match(response.headers.get("Content-Type")!, /text\/html/);
  return response.text();
}

function offlineView(
  html: string,
  stored: string | null,
  languages: string[],
  blocked?: "access" | "read",
) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const elements = Object.fromEntries(
    ["h1", "p", "button"].map((tag) => [
      tag,
      {
        textContent: html.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`))?.[1],
      },
    ]),
  );
  const document = {
    documentElement: { lang: html.match(/<html lang="([^"]+)"/)?.[1] },
    querySelector: (selector: string) => elements[selector],
    visibilityState: "visible",
  };
  const events = new Map<string, () => void>();
  const navigator = { languages, onLine: true };
  let tick: (() => void) | undefined;
  let reloads = 0;
  runInNewContext(script, {
    document,
    navigator,
    get localStorage() {
      if (blocked === "access") throw new Error("storage access blocked");
      return {
        getItem: () => {
          if (blocked === "read") throw new Error("storage read blocked");
          return stored;
        },
      };
    },
    addEventListener: (name: string, handler: () => void) => events.set(name, handler),
    setInterval: (handler: () => void, interval: number) => {
      assert.equal(interval, 10_000);
      tick = handler;
    },
    location: {
      reload: () => {
        reloads++;
      },
    },
  });
  return { document, elements, events, navigator, tick, reloads: () => reloads };
}

const offlineLabels = {
  zh: {
    lang: "zh-CN",
    h1: "无法连接网络",
    p: "请检查网络。连接恢复后，页面会自动重新加载。",
    button: "重新加载",
  },
  it: {
    lang: "it",
    h1: "Nessuna connessione",
    p: "Controlla la rete. Quando torna la connessione, la pagina si ricarica da sola.",
    button: "Ricarica",
  },
  en: {
    lang: "en",
    h1: "No connection",
    p: "Check your connection. The page will reload when it is restored.",
    button: "Reload",
  },
};

test("the actual offline page follows every saved language before browser preferences", async () => {
  const html = await offlineHtml();
  for (const language of ["zh", "it", "en"] as const) {
    const view = offlineView(html, language, [language === "it" ? "en-GB" : "it-IT"]);
    const expected = offlineLabels[language];
    assert.equal(view.document.documentElement.lang, expected.lang);
    assert.equal(view.elements.h1.textContent, expected.h1);
    assert.equal(view.elements.button.textContent, expected.button);
    assert.equal(view.elements.p.textContent, expected.p);
  }
});

test("the offline page matches supported browser languages and falls back to English", async () => {
  const html = await offlineHtml();
  for (const stored of [null, "", "fr", "EN", "constructor"]) {
    for (const languages of [
      ["de-DE", "IT-it", "en"],
      ["zh-TW", "en-US"],
      ["en-GB"],
      ["fr", "de"],
      [],
    ]) {
      const expected = offlineLabels[readStaffLanguage({ getItem: () => stored }, languages)];
      const view = offlineView(html, stored, languages);
      assert.equal(view.document.documentElement.lang, expected.lang);
      assert.equal(view.elements.h1.textContent, expected.h1);
      assert.equal(view.elements.p.textContent, expected.p);
      assert.equal(view.elements.button.textContent, expected.button);
    }
  }
});

test("blocked storage preserves language fallback and offline reconnection behavior", async () => {
  const html = await offlineHtml();
  for (const blocked of ["access", "read"] as const) {
    for (const languages of [["it-IT"], ["zh-CN"], ["fr"]]) {
      const expected = offlineLabels[readStaffLanguage(null, languages)];
      const view = offlineView(html, "en", languages, blocked);
      assert.equal(view.document.documentElement.lang, expected.lang);
      assert.equal(view.elements.h1.textContent, expected.h1);
      assert.equal(view.elements.p.textContent, expected.p);
      assert.equal(view.elements.button.textContent, expected.button);
      assert.ok(view.tick);
      view.events.get("online")!();
      assert.equal(view.reloads(), 1);
      view.navigator.onLine = false;
      view.tick();
      assert.equal(view.reloads(), 1);
      view.navigator.onLine = true;
      view.document.visibilityState = "hidden";
      view.tick();
      assert.equal(view.reloads(), 1);
      view.document.visibilityState = "visible";
      view.tick();
      assert.equal(view.reloads(), 2);
    }
  }
});
