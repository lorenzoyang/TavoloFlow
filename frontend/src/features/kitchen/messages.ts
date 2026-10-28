import type { StaffLanguage } from "@/lib/staff-language";
import type { OrderStatus } from "./state";

type Outcome = "reached" | "changed" | "legacy-reviewed" | "missing" | "confirm-again";

const zh = {
  title: "厨房",
  description: "逐项标记出餐，最早的待处理订单在前。",
  refresh: "刷新订单",
  status: { NEW: "待处理", PROCESSED: "已处理" } as Record<OrderStatus, string>,
  item: { NEW: "待出餐", READY: "已出餐", CANCELLED: "已取消" },
  orderedAt: (time: string) => `${time} 下单`,
  itemsWaiting: (waiting: number, total: number) => `待出餐 ${waiting} 项／共 ${total} 项`,
  waited: (minutes: number) => `已等待 ${minutes} 分钟`,
  allCancelled: "全部已取消",
  processed: "已处理",
  allergens: "过敏原：",
  readyAt: (time: string) => `出餐：${time}`,
  cancelledAt: (time: string) => `取消：${time} · 不计入应收`,
  ready: "出餐完成",
  moreActions: (name: string) => `${name}的更多操作`,
  cancelItem: "取消菜品",
  amounts: (total: string, payable: string) => `原订单金额：${total} · 应收：${payable}`,
  processedAt: (time: string) => `处理完毕：${time}`,
  pendingTotal: (count: number | string) => `全店待处理 ${count} 笔`,
  syncing: "正在同步订单。",
  maybeStale: "订单可能尚未更新。",
  writesPaused: "暂停状态修改，成功同步后即可继续。",
  readError: "无法更新订单，请检查连接后刷新。",
  storageWarning: "浏览器无法保存操作提示。请在当前页面核对待确认结果，刷新前先记录订单编号。",
  pendingSection: "待确认操作",
  verify: "核对菜品状态",
  pendingAction: (kind: "ready" | "cancel", order: string, item: string | null) =>
    `${kind === "ready" ? "完成" : "取消"}操作结果待确认 · 订单 #${order}${item ? ` · 菜品 #${item}` : " · 旧版整单操作"}`,
  statusTabs: "订单状态",
  listSummary: (status: string, total: number | string, shown: number) =>
    `${status}共 ${total} 笔 · 已显示 ${shown} 笔。仅显示正在用餐的订单。`,
  loading: "正在读取订单…",
  empty: { NEW: "暂无待处理订单。", PROCESSED: "暂无已处理订单。" } as Record<OrderStatus, string>,
  loadMore: "加载更多订单",
  cancelTitle: (table: string) => `确认取消菜品 · ${table}`,
  cancelHint: (dish: string, amount: string) =>
    `取消「${dish}」后，${amount} 将不计入应收。请先与厨房确认不再制作。`,
  confirmCancel: "确认取消菜品",
  changed: (status: string) => `菜品已变为“${status}”，本次取消确认已失效。`,
  unknownStatus: "未知",
  // Hook feedback.
  recovered: (table: string, outcome: Outcome) =>
    `${table}：${
      {
        reached: "已核对当前状态，操作目标已达到。",
        changed: "菜品已被处理，请查看最新状态。",
        "legacy-reviewed": "已核对旧版整单操作的当前记录，请查看逐项状态。",
        missing: "原菜品已不可访问，请由老板核对。",
        "confirm-again": "菜品仍为待出餐；如需处理，请重新核对并确认。",
      }[outcome]
    }`,
  recoveryClosed: "原订单已结束用餐或已不可访问，请由老板核对。不会重新发送操作。",
  recoveryUnknown: "结果仍待确认，请恢复连接后核对原订单。",
  arrivals: (added: number, pending: number) =>
    `收到 ${added} 笔新订单；当前待处理 ${pending} 笔。`,
  done: (label: string, kind: "ready" | "cancel") =>
    `${label}：${kind === "ready" ? "菜品已出餐。" : "菜品已取消，账单金额已更新。"}`,
  writeUnknown: "操作结果待确认。请核对原订单，系统不会自动重新提交。",
};

export const kitchenMessages: Record<StaffLanguage, typeof zh> = {
  zh,
  it: {
    title: "Cucina",
    description: "Segna i piatti pronti uno alla volta; gli ordini più vecchi sono in alto.",
    refresh: "Aggiorna ordini",
    status: { NEW: "Da fare", PROCESSED: "Evasi" },
    item: { NEW: "Da fare", READY: "Pronto", CANCELLED: "Annullato" },
    orderedAt: (time) => `Ordine delle ${time}`,
    itemsWaiting: (waiting, total) => `Da fare ${waiting} di ${total}`,
    waited: (minutes) => `${minutes} min`,
    allCancelled: "Tutto annullato",
    processed: "Evaso",
    allergens: "Allergeni: ",
    readyAt: (time) => `Pronto: ${time}`,
    cancelledAt: (time) => `Annullato: ${time} · escluso dal conto`,
    ready: "Pronto",
    moreActions: (name) => `Altre azioni: ${name}`,
    cancelItem: "Annulla piatto",
    amounts: (total, payable) => `Totale originale: ${total} · Da incassare: ${payable}`,
    processedAt: (time) => `Evaso: ${time}`,
    pendingTotal: (count) => `Ordini da fare: ${count}`,
    syncing: "Sincronizzazione degli ordini.",
    maybeStale: "Gli ordini potrebbero non essere aggiornati.",
    writesPaused: "Modifiche sospese fino al prossimo aggiornamento riuscito.",
    readError: "Impossibile aggiornare gli ordini. Controlla la connessione e aggiorna.",
    storageWarning:
      "Il browser non può salvare gli avvisi delle operazioni. Verifica qui gli esiti in sospeso e annota il numero d’ordine prima di ricaricare.",
    pendingSection: "Operazioni da verificare",
    verify: "Verifica il piatto",
    pendingAction: (kind, order, item) =>
      `Esito da verificare: ${kind === "ready" ? "pronto" : "annullamento"} · ordine #${order}${item ? ` · piatto #${item}` : " · vecchia operazione sull’intero ordine"}`,
    statusTabs: "Stato degli ordini",
    listSummary: (status, total, shown) =>
      `${status}: ${total} ordini, ${shown} visualizzati. Solo visite in corso.`,
    loading: "Caricamento ordini…",
    empty: { NEW: "Nessun ordine da fare.", PROCESSED: "Nessun ordine evaso." },
    loadMore: "Carica altri ordini",
    cancelTitle: (table) => `Annulla piatto · ${table}`,
    cancelHint: (dish, amount) =>
      `Annullando «${dish}», ${amount} non sarà più nel conto. Prima verifica con la cucina che non venga preparato.`,
    confirmCancel: "Annulla piatto",
    changed: (status) => `Il piatto ora è «${status}»: questa conferma non è più valida.`,
    unknownStatus: "sconosciuto",
    recovered: (table, outcome) =>
      `${table}: ${
        {
          reached: "stato verificato, l’operazione risulta eseguita.",
          changed: "il piatto è già stato gestito, controlla lo stato attuale.",
          "legacy-reviewed":
            "vecchia operazione sull’intero ordine verificata, controlla i singoli piatti.",
          missing: "il piatto originale non è più accessibile, lo verifichi il titolare.",
          "confirm-again": "il piatto è ancora da fare; se serve, ricontrolla e conferma di nuovo.",
        }[outcome]
      }`,
    recoveryClosed:
      "La visita dell’ordine è chiusa o non più accessibile: la verifichi il titolare. L’operazione non verrà reinviata.",
    recoveryUnknown:
      "Esito ancora da verificare: ricontrolla l’ordine quando torna la connessione.",
    arrivals: (added, pending) =>
      `${added === 1 ? "1 nuovo ordine" : `${added} nuovi ordini`}; da fare: ${pending}.`,
    done: (label, kind) =>
      `${label}: ${kind === "ready" ? "piatto pronto." : "piatto annullato, conto aggiornato."}`,
    writeUnknown:
      "Esito da verificare: controlla l’ordine originale. Nulla verrà reinviato automaticamente.",
  },
};
