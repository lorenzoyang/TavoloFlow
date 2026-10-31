import type { StaffLanguage } from "@/lib/staff-language";
import type { CloseKind } from "./state";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const zh = {
  close: { PAID: "已收款", EMPTY: "空桌关闭", VOIDED: "全部取消后关闭" } as Record<
    CloseKind,
    string
  >,
  // One order inside a bill.
  orderNew: "待处理",
  orderProcessed: "已处理",
  payable: (amount: string) => `应收 ${amount}`,
  originalTotal: (amount: string) => `原订单金额：${amount}`,
  item: { NEW: "待出餐", READY: "已出餐", CANCELLED: "已取消 · 不计应收" },
  unitPrice: (amount: string) => `单价 ${amount}`,
  readyAt: (time: string) => `出餐：${time}`,
  cancelledAt: (time: string) => `取消：${time}`,
  // The bill total.
  closedAmount: "关闭记录金额",
  totalDue: "整桌应收",
  dining: "用餐中",
  counts: (orders: number, items: number, waiting: number, cancelled: number) =>
    `共 ${orders} 笔订单、${items} 项 · 待出餐 ${waiting} 项 · 已取消 ${cancelled} 项`,
  times: (opened: string, closed: string | null) =>
    `开桌：${opened}${closed ? ` · 关桌：${closed}` : ""}`,
  sessionId: (id: string) => `用餐编号：${id}`,
  details: "账单明细",
  readError: "账单暂时无法更新，请恢复连接后刷新。",
  loading: "正在读取账单…",
  shown: (shown: number, total: number) =>
    `已显示 ${shown} / ${total} 笔。应收包含本轮全部未取消菜品，与已加载页数无关。`,
  noOrders: "本轮从未产生订单。",
  loadMore: "加载更多账单订单",
  // Closing the visit.
  checkout: "本轮结账",
  bill: "本轮账单",
  toKitchen: "去厨房处理",
  refresh: "刷新账单",
  conflict: (amount: string, waiting: number) =>
    `上次提交被拒绝时：应收 ${amount}，待处理 ${waiting} 项。请核对下方最新账单。`,
  storageWarning: "浏览器无法保存待确认提示，请在当前页面核对结果，刷新前记录本轮用餐编号。",
  verify: "核对原用餐状态",
  pending: (id: string) => `关闭结果待确认 · 用餐 #${id}。系统不会自动重新提交。`,
  closedTitle: (table: string) => `${table} · 本轮已结束`,
  closedSummary: (reason: string, amount: string) => `${reason} · 记录金额 ${amount}`,
  closedHint: "本轮顾客授权已失效。下一轮用餐须重新开桌。",
  toHistory: "查看历史账单",
  stalled: "账单正在同步或已过期，暂不能关闭。恢复连接并成功同步后继续。",
  waiting: (count: number) => `仍有 ${count} 项待出餐菜品，请先到厨房完成或按实际情况取消。`,
  closeButton: {
    PAID: "核对收款并清桌",
    EMPTY: "关闭空桌",
    VOIDED: "关闭全部取消的零账单",
  } as Record<CloseKind, string>,
  ownerCollects: "本轮仍有应收，请由老板核对收款。",
  confirmTitle: {
    PAID: "确认线下收款并清桌",
    EMPTY: "确认关闭空桌",
    VOIDED: "确认全部取消后关闭",
  } as Record<CloseKind, string>,
  confirmPaid: "请完成线下收款，再确认关闭本轮用餐。",
  confirmZero: "此操作不记录收款。请核对订单并确认顾客已离桌。",
  confirmPaidLabel: "已线下收款并清桌",
  confirmZeroLabel: "确认关闭本轮用餐",
  backToBill: "返回账单",
  checkAmount: (amount: string) => `核对金额：${amount}`,
  changed: "账单已变化，原确认已失效。请返回账单，核对最新金额后重新确认。",
  checkedPaid: "已核对桌号和金额，并完成线下收款",
  checkedZero: "已核对零账单，确认顾客已离桌",
  historyHint: "已关闭账单只读，内容来自本轮用餐和下单快照。",
  refreshHistoryDetail: "刷新历史详情",
  // Closure feedback.
  closedNotice: (table: string, reason: string, amount: string) =>
    `${table}已结束：${reason}，记录金额 ${amount}。`,
  recoveredClosed: (table: string, reason: string, amount: string) =>
    `${table}已结束：${reason}，记录金额 ${amount}。请核对实际收款。`,
  recoveredActive: (table: string) =>
    `${table}原用餐仍在进行，请重新核对账单后决定是否关闭。系统不会自动重新提交。`,
  recoveredMissing: "原用餐记录已不可访问，请联系老板核对。不会对同桌下一轮执行关闭。",
  recoverUnknown: "关闭结果仍待确认，请恢复连接后核对原用餐。",
  writeUnknown: "关闭结果待确认。请核对原用餐，系统不会自动重新提交。",
  // The orders page.
  ownerOnly: "此页面仅老板可访问。",
  toFloor: "返回桌台",
  title: "结账",
  description: "核对账单，线下收款后结束本轮用餐或自取单。",
  refreshVisits: "刷新单据",
  visitsError: "进行中的单据暂时无法更新，请恢复连接后刷新。",
  loadingVisits: "正在读取进行中的单据…",
  noVisits: "当前没有进行中的单据",
  noVisitsHint: "开桌或接单后，进行中的单据会出现在这里。",
  channelFilter: "渠道",
  channelAll: "全部",
  channelDineIn: "堂食",
  channelPickup: "自取",
  pickupSummary: (time: string) => `${time} 接单`,
  pendingBadge: (count: number) => `待处理 ${count}`,
  tableSummary: (orders: number, time: string) => `共 ${orders} 笔 · ${time} 开桌`,
  // History.
  historyTitle: "历史账单",
  historyDescription: "默认查看餐厅当天关闭的用餐。按关桌日期查询，保留原始账单快照。",
  refreshHistory: "刷新历史列表",
  fromDate: "关桌起始日期",
  toDate: "关桌结束日期",
  tableLabel: "历史桌号（精确匹配）",
  closeReason: "关闭原因",
  all: "全部",
  search: "查询历史账单",
  today: "回到当天全部账单",
  historyError: "历史列表暂时无法更新，请重新读取。",
  historyDetail: "历史详情",
  historyDetailOf: (table: string) => `${table} · 历史详情`,
  loadingHistory: "正在读取历史账单…",
  historySummary: (from: string, to: string, zone: string, total: number, shown: number) =>
    `${from} 至 ${to} · ${zone} · 共 ${total} 笔用餐 · 已显示 ${shown} 笔`,
  noHistory: "该筛选范围内没有已关闭账单。",
  closedAt: (time: string) => `关桌：${time}`,
  loadMoreHistory: "加载更多历史账单",
};

export const billingMessages: Record<StaffLanguage, typeof zh> = {
  zh,
  it: {
    close: { PAID: "Pagato", EMPTY: "Chiuso vuoto", VOIDED: "Tutto annullato" },
    orderNew: "Da fare",
    orderProcessed: "Evaso",
    payable: (amount) => `Da incassare ${amount}`,
    originalTotal: (amount) => `Totale originale: ${amount}`,
    item: { NEW: "Da fare", READY: "Pronto", CANCELLED: "Annullato · escluso" },
    unitPrice: (amount) => `Prezzo unitario ${amount}`,
    readyAt: (time) => `Pronto: ${time}`,
    cancelledAt: (time) => `Annullato: ${time}`,
    closedAmount: "Importo registrato",
    totalDue: "Totale da incassare",
    dining: "In corso",
    counts: (orders, items, waiting, cancelled) =>
      `${plural(orders, "ordine", "ordini")}, ${plural(items, "piatto", "piatti")} · da fare ${waiting} · annullati ${cancelled}`,
    times: (opened, closed) => `Aperto: ${opened}${closed ? ` · Chiuso: ${closed}` : ""}`,
    sessionId: (id) => `ID visita: ${id}`,
    details: "Dettaglio del conto",
    readError: "Impossibile aggiornare il conto: aggiorna quando torna la connessione.",
    loading: "Caricamento del conto…",
    shown: (shown, total) =>
      `Visualizzati ${shown} di ${total} ordini. Il totale comprende tutti i piatti non annullati della visita, anche quelli non ancora caricati.`,
    noOrders: "Nessun ordine in questa visita.",
    loadMore: "Carica altri ordini",
    checkout: "Chiusura della visita",
    bill: "Conto della visita",
    toKitchen: "Vai in cucina",
    refresh: "Aggiorna conto",
    conflict: (amount, waiting) =>
      `Al momento del rifiuto: da incassare ${amount}, da fare ${waiting}. Controlla il conto aggiornato qui sotto.`,
    storageWarning:
      "Il browser non può salvare gli avvisi in sospeso: verifica l’esito qui e annota l’ID della visita prima di ricaricare.",
    verify: "Verifica la visita",
    pending: (id) =>
      `Chiusura da verificare · visita #${id}. Nulla verrà reinviato automaticamente.`,
    closedTitle: (table) => `${table} · visita chiusa`,
    closedSummary: (reason, amount) => `${reason} · importo registrato ${amount}`,
    closedHint:
      "Gli accessi dei clienti non sono più validi. Per una nuova visita riapri il tavolo.",
    toHistory: "Vedi nello storico",
    stalled:
      "Il conto è in aggiornamento o non è aggiornato: si potrà chiudere dopo la prossima sincronizzazione riuscita.",
    waiting: (count) =>
      `Ancora ${plural(count, "piatto", "piatti")} da fare: completali in cucina o annullali.`,
    closeButton: {
      PAID: "Incassa e libera il tavolo",
      EMPTY: "Chiudi tavolo vuoto",
      VOIDED: "Chiudi conto a zero",
    },
    ownerCollects: "C’è ancora da incassare: il titolare deve verificare il pagamento.",
    confirmTitle: {
      PAID: "Incasso e tavolo libero",
      EMPTY: "Chiudi tavolo vuoto",
      VOIDED: "Chiudi dopo l’annullamento",
    },
    confirmPaid: "Prima incassa il pagamento, poi conferma la chiusura della visita.",
    confirmZero:
      "Non viene registrato alcun incasso. Controlla gli ordini e conferma che i clienti sono andati via.",
    confirmPaidLabel: "Incassato, libera tavolo",
    confirmZeroLabel: "Chiudi la visita",
    backToBill: "Torna al conto",
    checkAmount: (amount) => `Importo: ${amount}`,
    changed:
      "Il conto è cambiato e questa conferma non vale più. Torna al conto, controlla l’importo aggiornato e conferma di nuovo.",
    checkedPaid: "Ho controllato tavolo e importo e ho incassato il pagamento",
    checkedZero: "Ho controllato il conto a zero e i clienti sono andati via",
    historyHint:
      "I conti chiusi sono in sola lettura e riportano gli ordini come erano al momento dell’invio.",
    refreshHistoryDetail: "Aggiorna dettaglio",
    closedNotice: (table, reason, amount) =>
      `${table} chiuso: ${reason}, importo registrato ${amount}.`,
    recoveredClosed: (table, reason, amount) =>
      `${table} chiuso: ${reason}, importo registrato ${amount}. Verifica l’incasso effettivo.`,
    recoveredActive: (table) =>
      `${table}: la visita è ancora in corso. Ricontrolla il conto prima di chiuderla; nulla verrà reinviato automaticamente.`,
    recoveredMissing:
      "La visita originale non è più accessibile: chiedi al titolare di verificare. La visita successiva dello stesso tavolo non verrà chiusa.",
    recoverUnknown:
      "Chiusura ancora da verificare: ricontrolla la visita quando torna la connessione.",
    writeUnknown:
      "Chiusura da verificare: controlla la visita originale. Nulla verrà reinviato automaticamente.",
    ownerOnly: "Questa pagina è riservata al titolare.",
    toFloor: "Torna alla sala",
    title: "Conto",
    description: "Controlla il conto e chiudi la visita o l’asporto dopo l’incasso.",
    refreshVisits: "Aggiorna",
    visitsError: "Impossibile aggiornare i conti aperti: aggiorna quando torna la connessione.",
    loadingVisits: "Caricamento dei conti aperti…",
    noVisits: "Nessun conto aperto",
    noVisitsHint: "Qui compaiono i tavoli aperti e gli asporti accettati.",
    channelFilter: "Canale",
    channelAll: "Tutti",
    channelDineIn: "Al tavolo",
    channelPickup: "Asporto",
    pickupSummary: (time) => `accettato alle ${time}`,
    pendingBadge: (count) => `Da fare ${count}`,
    tableSummary: (orders, time) => `${plural(orders, "ordine", "ordini")} · aperto ${time}`,
    historyTitle: "Storico conti",
    historyDescription:
      "Mostra le visite chiuse oggi. Cerca per data di chiusura; i conti restano come al momento della chiusura.",
    refreshHistory: "Aggiorna storico",
    fromDate: "Chiusura dal",
    toDate: "Chiusura al",
    tableLabel: "Tavolo (nome esatto)",
    closeReason: "Motivo di chiusura",
    all: "Tutti",
    search: "Cerca",
    today: "Torna a oggi",
    historyError: "Impossibile aggiornare lo storico: ricarica.",
    historyDetail: "Dettaglio",
    historyDetailOf: (table) => `${table} · dettaglio`,
    loadingHistory: "Caricamento dello storico…",
    historySummary: (from, to, zone, total, shown) =>
      `Dal ${from} al ${to} · ${zone} · ${plural(total, "visita", "visite")} · ${shown} visualizzate`,
    noHistory: "Nessun conto chiuso con questi filtri.",
    closedAt: (time) => `Chiuso: ${time}`,
    loadMoreHistory: "Carica altri conti",
  },
};
