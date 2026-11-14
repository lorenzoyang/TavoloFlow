import type { Language } from "@/lib/language";

// The home page's lock-screen notification switch. The notification text itself is in public/sw.js.
const zh = {
  section: "锁屏通知",
  description:
    "有新的线上订单时，本设备锁屏或在后台也会收到一条系统通知，响一次系统提示音。打开页面后，横幅仍会持续响铃。",
  enable: "在本设备开启",
  enabling: "正在开启…",
  disable: "在本设备关闭",
  disabling: "正在关闭…",
  on: "本设备已开启锁屏通知。",
  denied: "通知已被阻止。请在系统或浏览器设置里允许本应用的通知，然后重新打开页面。",
  installFirst:
    "iPhone / iPad 需要先把应用添加到主屏幕（见下方“安装到本设备”），再从主屏幕图标打开，才能开启锁屏通知。",
  unsupported: "这个浏览器不支持锁屏通知。",
  failed: "未能确认是否已开启，请再试一次。",
  note: "通知只显示单号，不含顾客信息。每台设备分别开启；退出登录后本设备不再收到，之后在本设备登录会自动恢复。",
};

export const pushMessages: Record<Language, typeof zh> = {
  zh,
  it: {
    section: "Notifiche a schermo bloccato",
    description:
      "Quando arriva un nuovo ordine online, questo dispositivo riceve una notifica con un suono anche a schermo bloccato o con l’app in background. Con la pagina aperta, il banner continua a suonare.",
    enable: "Attiva su questo dispositivo",
    enabling: "Attivazione…",
    disable: "Disattiva su questo dispositivo",
    disabling: "Disattivazione…",
    on: "Notifiche attive su questo dispositivo.",
    denied:
      "Le notifiche sono bloccate. Consentile a quest’app nelle impostazioni del sistema o del browser, poi riapri la pagina.",
    installFirst:
      "Su iPhone e iPad aggiungi prima l’app alla schermata Home (vedi «Installa su questo dispositivo») e aprila dall’icona: solo così puoi attivare le notifiche.",
    unsupported: "Questo browser non supporta le notifiche a schermo bloccato.",
    failed: "Non è chiaro se le notifiche si siano attivate. Riprova.",
    note: "La notifica mostra solo il numero dell’ordine, mai i dati del cliente. Si attiva su ogni dispositivo; dopo l’uscita il dispositivo non riceve più nulla e riprende da solo al prossimo accesso.",
  },
  en: {
    section: "Lock-screen notifications",
    description:
      "When a new online order arrives, this device gets a system notification with one sound, even when locked or in the background. With the page open, the banner keeps ringing.",
    enable: "Turn on for this device",
    enabling: "Turning on…",
    disable: "Turn off for this device",
    disabling: "Turning off…",
    on: "Notifications are on for this device.",
    denied:
      "Notifications are blocked. Allow them for this app in the system or browser settings, then reopen the page.",
    installFirst:
      "On iPhone and iPad, first add the app to the Home Screen (see “Install on this device”) and open it from the icon; only then can notifications be turned on.",
    unsupported: "This browser doesn’t support lock-screen notifications.",
    failed: "We couldn’t confirm notifications are on. Try again.",
    note: "Notifications show only the order number, never customer details. Turn them on for each device; after signing out the device gets nothing, and it resumes on its own at the next sign-in.",
  },
};
