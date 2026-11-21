const restaurantsPage = "/platform/restaurants";
const messages = {
  zh: { title: "收费提醒", body: "打开后台查看", count: (count) => `${count} 家餐厅有收费提醒` },
  it: {
    title: "Avvisi sugli abbonamenti",
    body: "Apri l’area amministratore",
    count: (count) => (count === 1 ? "1 ristorante da seguire" : `${count} ristoranti da seguire`),
  },
  en: {
    title: "Subscription reminders",
    body: "Open the admin area",
    count: (count) =>
      count === 1 ? "1 restaurant to follow up" : `${count} restaurants to follow up`,
  },
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {}
  const language = Object.hasOwn(messages, payload.language) ? payload.language : "en";
  const copy = messages[language];
  const batchCount = payload.count;
  event.waitUntil(
    self.registration.showNotification(copy.title, {
      body: Number.isInteger(batchCount) && batchCount > 0 ? copy.count(batchCount) : copy.body,
      tag: "subscription-reminders",
      renotify: true,
      lang: language === "zh" ? "zh-CN" : language,
      icon: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const target = new URL(restaurantsPage, self.location.origin).href;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const platform = windows.find((client) => {
        const path = new URL(client.url).pathname;
        return path === "/platform" || path.startsWith("/platform/");
      });
      if (platform) {
        await platform.focus();
        if (platform.url === target) return;
        if (await platform.navigate(target).catch(() => null)) return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
