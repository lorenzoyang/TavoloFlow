import type { StaffLanguage } from "./staff-language";

// Copy shared by several store pages. Each feature keeps the rest in its own messages.ts.
const zh = {
  table: (label: string) => `${label} 桌`,
  home: "首页",
  close: "关闭",
  cancel: "取消",
  back: "返回",
  sound: "声音提醒",
  soundOn: "开启声音",
  soundBlocked: "浏览器要求先点按一次页面才能播放提醒声。点按页面任意位置即可开启。",
  soundUnsupported: "此浏览器不支持声音提醒；页面仍会正常更新。",
  wakeLock: "屏幕常亮",
  wakeLockFailed: "未能保持屏幕常亮（浏览器拒绝或处于省电模式），可点按「屏幕常亮」重试。",
  lastSync: (time: string) => `最后成功同步：${time}`,
  notSynced: "尚未同步",
  disconnected: "连接已断开或页面暂停。",
  remark: (text: string) => `备注：${text}`,
};

export const staffMessages: Record<StaffLanguage, typeof zh> = {
  zh,
  it: {
    table: (label) => `Tavolo ${label}`,
    home: "Home",
    close: "Chiudi",
    cancel: "Annulla",
    back: "Indietro",
    sound: "Suoni",
    soundOn: "Attiva suoni",
    soundBlocked:
      "Il browser richiede un tocco sulla pagina prima di riprodurre i suoni. Tocca un punto qualsiasi.",
    soundUnsupported: "Questo browser non riproduce i suoni; la pagina si aggiorna comunque.",
    wakeLock: "Schermo acceso",
    wakeLockFailed:
      "Impossibile tenere lo schermo acceso (rifiutato dal browser o risparmio energetico). Tocca «Schermo acceso» per riprovare.",
    lastSync: (time) => `Ultimo aggiornamento: ${time}`,
    notSynced: "Non ancora aggiornato",
    disconnected: "Connessione persa o pagina in pausa.",
    remark: (text) => `Nota: ${text}`,
  },
};
