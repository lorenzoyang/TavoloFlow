// Service worker of the installed staff app. StaffLayout registers it with scope /staff only, so
// it never controls the guest pages on /q/*. It caches nothing: every page load goes to the
// network, and only a load that fails gets the offline page below instead of the browser's error
// page. All other requests, /api included, are left to the browser. Chromium also needs this
// fetch handler before it offers its install prompt.

// Colours mirror the tokens in src/index.css; the app's own styles are not available offline.
const offlinePage = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#FBF8F3" />
    <title>Qiao TavoloFlow</title>
    <style>
      body {
        box-sizing: border-box;
        display: grid;
        place-items: center;
        min-height: 100dvh;
        margin: 0;
        padding: max(1.5rem, env(safe-area-inset-top)) 1rem
          max(1.5rem, env(safe-area-inset-bottom));
        background: #fbf8f3;
        color: #2b211c;
        font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC",
          "Noto Sans CJK SC", system-ui, sans-serif;
        text-align: center;
      }
      main {
        max-width: 22rem;
      }
      h1 {
        margin: 1.25rem 0 0.5rem;
        font-size: 1.25rem;
      }
      p {
        margin: 0 0 1.5rem;
        color: #6f625a;
        line-height: 1.6;
      }
      button {
        min-height: 44px;
        padding: 0 1.25rem;
        border: 0;
        border-radius: 0.75rem;
        background: #b9532c;
        color: #fffcf8;
        font: inherit;
        font-weight: 600;
      }
      button:focus-visible {
        outline: 3px solid rgb(185 83 44 / 0.5);
        outline-offset: 2px;
      }
    </style>
  </head>
  <body>
    <main>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        width="56"
        height="56"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="8" fill="#B9532C" />
        <g
          transform="translate(5 5) scale(0.9167)"
          fill="none"
          stroke="#FFFCF8"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8" />
          <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7" />
          <path d="m2.1 21.8 6.4-6.3" />
          <path d="m19 5-7 7" />
        </g>
      </svg>
      <h1>无法连接网络</h1>
      <p>请检查网络。连接恢复后，页面会自动重新加载。</p>
      <button type="button" onclick="location.reload()">重新加载</button>
    </main>
    <script>
      // The page follows the device's staff language (src/lib/staff-language.ts); Chinese otherwise.
      try {
        if (localStorage.getItem("tavoloflow:staff-language") === "it") {
          document.documentElement.lang = "it";
          document.querySelector("h1").textContent = "Nessuna connessione";
          document.querySelector("p").textContent =
            "Controlla la rete. Quando torna la connessione, la pagina si ricarica da sola.";
          document.querySelector("button").textContent = "Ricarica";
        }
      } catch {}
      // Reconnecting reloads at once. While the device reports a connection but the server still
      // cannot be reached (Wi-Fi still joining, a restart), it retries every 10 seconds.
      addEventListener("online", () => location.reload());
      setInterval(() => {
        if (navigator.onLine && document.visibilityState === "visible") location.reload();
      }, 10000);
    </script>
  </body>
</html>
`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Page requests start while the worker boots, so the worker never delays a launch.
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) ?? (await fetch(event.request));
      } catch {
        return new Response(offlinePage, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    })(),
  );
});
