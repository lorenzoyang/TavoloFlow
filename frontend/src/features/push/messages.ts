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
  syncing: "正在同步通知…",
  retry: "重试同步",
  denied: "通知已被阻止。请在系统或浏览器设置里允许本应用的通知，然后重新打开页面。",
  installFirst:
    "iPhone / iPad 需要先把应用添加到主屏幕（见下方“安装到本设备”），再从主屏幕图标打开，才能开启锁屏通知。",
  unsupported: "这个浏览器不支持锁屏通知。",
  failed: "通知同步失败，尚未确认本设备可以接收通知。请重试。",
  note: "通知只显示单号，不含顾客信息。每台设备分别开启；成功退出后停止发送，已发出的通知仍可能到达。下次登录自动恢复；同步失败可重试，回到前台或恢复网络时也会重新核对。",
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
    syncing: "Sincronizzazione notifiche…",
    retry: "Riprova",
    denied:
      "Le notifiche sono bloccate. Consentile a quest’app nelle impostazioni del sistema o del browser, poi riapri la pagina.",
    installFirst:
      "Su iPhone e iPad aggiungi prima l’app alla schermata Home (vedi «Installa su questo dispositivo») e aprila dall’icona: solo così puoi attivare le notifiche.",
    unsupported: "Questo browser non supporta le notifiche a schermo bloccato.",
    failed:
      "Sincronizzazione non riuscita. Non è confermato che il dispositivo riceva notifiche. Riprova.",
    note: "Solo il numero dell’ordine, mai dati del cliente. Attivale su ogni dispositivo. Dopo l’uscita non se ne inviano più; quelle già inviate possono ancora arrivare. Riprendono al prossimo accesso. Se la sincronizzazione fallisce, riprova: si ripete anche tornando all’app o alla rete.",
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
    syncing: "Syncing notifications…",
    retry: "Retry sync",
    denied:
      "Notifications are blocked. Allow them for this app in the system or browser settings, then reopen the page.",
    installFirst:
      "On iPhone and iPad, first add the app to the Home Screen (see “Install on this device”) and open it from the icon; only then can notifications be turned on.",
    unsupported: "This browser doesn’t support lock-screen notifications.",
    failed:
      "Notification sync failed. This device is not confirmed to receive notifications. Try again.",
    note: "Only the order number, never customer details. Enable each device separately. Signing out stops sending; notifications already sent may still arrive. They resume at the next sign-in. Retry a failed sync, or return to the app or reconnect to check again.",
  },
};
