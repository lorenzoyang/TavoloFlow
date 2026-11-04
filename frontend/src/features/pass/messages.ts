import type { Language } from "@/lib/language";

const zh = {
  title: "传菜",
  description: "厨房出餐后菜品出现在这里，最早出餐的桌在前。取走菜品时点「已送达」。",
  refresh: "刷新菜品",
  toServe: (count: number) => `待送 ${count} 道`,
  justReady: "刚出餐",
  waited: (minutes: number) => `已等 ${minutes} 分钟`,
  served: "已送达",
  servedLabel: (table: string, dish: string) => `${table} ${dish} 已送达`,
  totalToServe: (count: number | string) => `全店待送 ${count} 道`,
  syncing: "正在同步菜品。",
  maybeStale: "菜品可能尚未更新。",
  writesPaused: "暂停标记送达，成功同步后即可继续。",
  readError: "无法更新菜品，请检查连接后刷新。",
  loading: "正在读取待送菜品…",
  empty: "暂无待送菜品。",
  loadMore: "加载更多菜品",
  // Hook feedback.
  arrived: (count: number) => `有新的菜品出餐；当前待送 ${count} 道。`,
  done: (label: string) => `${label}：已送达。`,
  settled: (label: string) => `${label}：已由其他设备处理或该桌已结账，列表已更新。`,
  unknown: (label: string) =>
    `${label}：结果未能确认。列表刷新后，若菜品仍在，请再点一次「已送达」。`,
};

export const passMessages: Record<Language, typeof zh> = {
  zh,
  it: {
    title: "Pass",
    description:
      "Qui compaiono i piatti pronti, i più vecchi in alto. Quando porti un piatto al tavolo, tocca «Servito».",
    refresh: "Aggiorna piatti",
    toServe: (count) => `Da servire: ${count}`,
    justReady: "Ora",
    waited: (minutes) => `${minutes} min`,
    served: "Servito",
    servedLabel: (table, dish) => `${dish}, ${table}: servito`,
    totalToServe: (count) => `Piatti da servire: ${count}`,
    syncing: "Sincronizzazione dei piatti.",
    maybeStale: "I piatti potrebbero non essere aggiornati.",
    writesPaused: "«Servito» è sospeso fino al prossimo aggiornamento riuscito.",
    readError: "Impossibile aggiornare i piatti. Controlla la connessione e aggiorna.",
    loading: "Caricamento dei piatti da servire…",
    empty: "Nessun piatto da servire.",
    loadMore: "Carica altri piatti",
    arrived: (count) => `Nuovi piatti pronti; da servire: ${count}.`,
    done: (label) => `${label}: servito.`,
    settled: (label) =>
      `${label}: già gestito da un altro dispositivo o tavolo già chiuso; lista aggiornata.`,
    unknown: (label) =>
      `${label}: esito non confermato. Dopo l’aggiornamento, se il piatto è ancora in lista, tocca di nuovo «Servito».`,
  },
  en: {
    title: "Pass",
    description:
      "Ready dishes show up here, oldest at the top. When you take a dish to the table, tap «Served».",
    refresh: "Refresh dishes",
    toServe: (count) => `To serve: ${count}`,
    justReady: "Now",
    waited: (minutes) => `${minutes} min`,
    served: "Served",
    servedLabel: (table, dish) => `${dish}, ${table}: served`,
    totalToServe: (count) => `Dishes to serve: ${count}`,
    syncing: "Updating dishes.",
    maybeStale: "Dishes may be out of date.",
    writesPaused: "«Served» is paused until the next successful update.",
    readError: "Can’t update the dishes. Check the connection and refresh.",
    loading: "Loading dishes to serve…",
    empty: "No dishes to serve.",
    loadMore: "Load more dishes",
    arrived: (count) => `New dishes ready; to serve: ${count}.`,
    done: (label) => `${label}: served.`,
    settled: (label) =>
      `${label}: already handled on another device or the table is closed; list updated.`,
    unknown: (label) =>
      `${label}: result not confirmed. After the update, if the dish is still listed, tap «Served» again.`,
  },
};
