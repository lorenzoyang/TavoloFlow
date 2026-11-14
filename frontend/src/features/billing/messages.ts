import type { Language } from "@/lib/language";
import type { CloseKind } from "./state";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const zh = {
  close: { PAID: "已收款", EMPTY: "空桌关闭", VOIDED: "全部取消后关闭", NO_SHOW: "未取" } as Record<
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
    NO_SHOW: "顾客未取餐",
  } as Record<CloseKind, string>,
  ownerCollects: "本轮仍有应收，请由老板核对收款。",
  confirmTitle: {
    PAID: "确认线下收款并清桌",
    EMPTY: "确认关闭空桌",
    VOIDED: "确认全部取消后关闭",
    NO_SHOW: "确认顾客未取餐",
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
  description: "核对账单，线下收款后关闭。",
  refreshTables: "刷新列表",
  tablesError: "账单列表暂时无法更新，请恢复连接后刷新。",
  loadingTables: "正在读取进行中的账单…",
  noVisits: "当前没有进行中的账单",
  noVisitsHint: (dineIn: boolean, online: boolean): string =>
    dineIn && online
      ? "开桌或接受线上订单后，会出现在这里。"
      : online
        ? "接受线上订单后，会出现在这里。"
        : "开桌后，用餐中的桌会出现在这里。",
  pendingBadge: (count: number) => `待处理 ${count}`,
  tableSummary: (orders: number, time: string) => `共 ${orders} 笔 · ${time} 开桌`,
  // Accepted online orders (pickup): the same bill, worded for a customer who collects.
  online: {
    totalDue: "应收",
    active: "进行中",
    times: (accepted: string, closed: string | null) =>
      `接单：${accepted}${closed ? ` · 关闭：${closed}` : ""}`,
    estimated: (time: string) => `预计 ${time}`,
    call: (phone: string) => `拨打 ${phone}`,
    closedHint: "这一单已结束，顾客的订单页会显示结果。",
    summary: (time: string) => `${time} 接单`,
    paidButton: "已取餐，核对收款",
    paidTitle: "确认已取餐并收款",
    confirmPaid: "请确认顾客已取餐并完成线下收款，再关闭这一单。",
    confirmPaidLabel: "已取餐并收款",
    checkedPaid: "已核对单号和金额，顾客已取餐并付款",
    confirmZero: "此操作不记录收款。请核对订单，并确认已通知顾客。",
    checkedZero: "已核对零账单，并已通知顾客",
    confirmNoShow: "这一单按「未取」关闭：记录没收到的应收款，不记录收款。请先打电话联系顾客。",
    confirmNoShowLabel: "按未取关闭",
    checkedNoShow: "已核对单号和金额，顾客没有来取餐",
  },
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

export const billingMessages: Record<Language, typeof zh> = {
  zh,
  it: {
    close: {
      PAID: "Pagato",
      EMPTY: "Chiuso vuoto",
      VOIDED: "Tutto annullato",
      NO_SHOW: "Non ritirato",
    },
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
      NO_SHOW: "Cliente non venuto",
    },
    ownerCollects: "C’è ancora da incassare: il titolare deve verificare il pagamento.",
    confirmTitle: {
      PAID: "Incasso e tavolo libero",
      EMPTY: "Chiudi tavolo vuoto",
      VOIDED: "Chiudi dopo l’annullamento",
      NO_SHOW: "Conferma ordine non ritirato",
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
    description: "Controlla il conto e chiudilo dopo l’incasso.",
    refreshTables: "Aggiorna elenco",
    tablesError: "Impossibile aggiornare l’elenco: aggiorna quando torna la connessione.",
    loadingTables: "Caricamento dei conti aperti…",
    noVisits: "Nessun conto aperto",
    noVisitsHint: (dineIn, online) =>
      dineIn && online
        ? "I tavoli aperti e gli ordini online accettati compaiono qui."
        : online
          ? "Gli ordini online accettati compaiono qui."
          : "I tavoli aperti compaiono qui.",
    pendingBadge: (count) => `Da fare ${count}`,
    tableSummary: (orders, time) => `${plural(orders, "ordine", "ordini")} · aperto ${time}`,
    online: {
      totalDue: "Da incassare",
      active: "In corso",
      times: (accepted, closed) => `Accettato: ${accepted}${closed ? ` · Chiuso: ${closed}` : ""}`,
      estimated: (time) => `Previsto ${time}`,
      call: (phone) => `Chiama ${phone}`,
      closedHint: "Ordine concluso: la pagina del cliente mostra l’esito.",
      summary: (time) => `accettato ${time}`,
      paidButton: "Ritirato, verifica incasso",
      paidTitle: "Conferma ritiro e incasso",
      confirmPaid: "Conferma che il cliente ha ritirato l’ordine e hai incassato, poi chiudilo.",
      confirmPaidLabel: "Ritirato e incassato",
      checkedPaid: "Ho controllato numero e importo: il cliente ha ritirato e pagato",
      confirmZero:
        "Non viene registrato alcun incasso. Controlla l’ordine e conferma di aver avvisato il cliente.",
      checkedZero: "Ho controllato il conto a zero e ho avvisato il cliente",
      confirmNoShow:
        "L’ordine si chiude come non ritirato: registra l’importo non incassato, nessun pagamento. Prima prova a chiamare il cliente.",
      confirmNoShowLabel: "Chiudi come non ritirato",
      checkedNoShow: "Ho controllato numero e importo: il cliente non è venuto a ritirare",
    },
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
  en: {
    close: {
      PAID: "Paid",
      EMPTY: "Closed empty",
      VOIDED: "All cancelled",
      NO_SHOW: "Not collected",
    },
    orderNew: "To do",
    orderProcessed: "Done",
    payable: (amount) => `Due ${amount}`,
    originalTotal: (amount) => `Original total: ${amount}`,
    item: { NEW: "To do", READY: "Ready", CANCELLED: "Cancelled · not charged" },
    unitPrice: (amount) => `Unit price ${amount}`,
    readyAt: (time) => `Ready: ${time}`,
    cancelledAt: (time) => `Cancelled: ${time}`,
    closedAmount: "Recorded amount",
    totalDue: "Total due",
    dining: "Dining",
    counts: (orders, items, waiting, cancelled) =>
      `${plural(orders, "order", "orders")}, ${plural(items, "dish", "dishes")} · to do ${waiting} · cancelled ${cancelled}`,
    times: (opened, closed) => `Opened: ${opened}${closed ? ` · Closed: ${closed}` : ""}`,
    sessionId: (id) => `Visit ID: ${id}`,
    details: "Bill details",
    readError: "Can’t update the bill: refresh when the connection is back.",
    loading: "Loading the bill…",
    shown: (shown, total) =>
      `Showing ${shown} of ${total} orders. The total includes every dish of the visit that isn’t cancelled, loaded or not.`,
    noOrders: "No orders in this visit.",
    loadMore: "Load more orders",
    checkout: "Close the visit",
    bill: "Visit bill",
    toKitchen: "Go to kitchen",
    refresh: "Refresh bill",
    conflict: (amount, waiting) =>
      `When it was rejected: due ${amount}, to do ${waiting}. Check the updated bill below.`,
    storageWarning:
      "The browser can’t save pending notices: check the result here and note the visit ID before reloading.",
    verify: "Check the visit",
    pending: (id) => `Closing to be checked · visit #${id}. Nothing is resent automatically.`,
    closedTitle: (table) => `${table} · visit closed`,
    closedSummary: (reason, amount) => `${reason} · recorded amount ${amount}`,
    closedHint: "Guest access is no longer valid. For a new visit, open the table again.",
    toHistory: "See in history",
    stalled:
      "The bill is updating or out of date: you can close it after the next successful update.",
    waiting: (count) =>
      `${plural(count, "dish", "dishes")} still to do: finish them in the kitchen or cancel them.`,
    closeButton: {
      PAID: "Take payment, free table",
      EMPTY: "Close empty table",
      VOIDED: "Close zero bill",
      NO_SHOW: "Customer didn’t come",
    },
    ownerCollects: "There’s still money due: the owner must check the payment.",
    confirmTitle: {
      PAID: "Payment taken, table free",
      EMPTY: "Close empty table",
      VOIDED: "Close after cancellation",
      NO_SHOW: "Confirm order not collected",
    },
    confirmPaid: "Take the payment first, then confirm closing the visit.",
    confirmZero: "No payment is recorded. Check the orders and confirm the guests have left.",
    confirmPaidLabel: "Paid, free table",
    confirmZeroLabel: "Close the visit",
    backToBill: "Back to bill",
    checkAmount: (amount) => `Amount: ${amount}`,
    changed:
      "The bill has changed and this confirmation no longer applies. Go back to the bill, check the updated amount and confirm again.",
    checkedPaid: "I checked the table and amount and took the payment",
    checkedZero: "I checked the zero bill and the guests have left",
    historyHint: "Closed bills are read-only and show the orders as they were when sent.",
    refreshHistoryDetail: "Refresh details",
    closedNotice: (table, reason, amount) =>
      `${table} closed: ${reason}, recorded amount ${amount}.`,
    recoveredClosed: (table, reason, amount) =>
      `${table} closed: ${reason}, recorded amount ${amount}. Check the actual payment.`,
    recoveredActive: (table) =>
      `${table}: the visit is still open. Check the bill again before closing it; nothing is resent automatically.`,
    recoveredMissing:
      "The original visit is no longer available: ask the owner to check. The table’s next visit won’t be closed.",
    recoverUnknown: "Closing still to be checked: check the visit when the connection is back.",
    writeUnknown:
      "Closing to be checked: check the original visit. Nothing is resent automatically.",
    ownerOnly: "This page is for the owner only.",
    toFloor: "Back to floor",
    title: "Bill",
    description: "Check the bill and close it after payment.",
    refreshTables: "Refresh list",
    tablesError: "Can’t update the list: refresh when the connection is back.",
    loadingTables: "Loading open bills…",
    noVisits: "No open bills",
    noVisitsHint: (dineIn, online) =>
      dineIn && online
        ? "Open tables and accepted online orders show up here."
        : online
          ? "Accepted online orders show up here."
          : "Open tables show up here.",
    pendingBadge: (count) => `To do ${count}`,
    tableSummary: (orders, time) => `${plural(orders, "order", "orders")} · opened ${time}`,
    online: {
      totalDue: "Due",
      active: "In progress",
      times: (accepted, closed) => `Accepted: ${accepted}${closed ? ` · Closed: ${closed}` : ""}`,
      estimated: (time) => `Expected ${time}`,
      call: (phone) => `Call ${phone}`,
      closedHint: "This order is closed: the customer’s order page shows the outcome.",
      summary: (time) => `accepted ${time}`,
      paidButton: "Collected, check payment",
      paidTitle: "Confirm collection and payment",
      confirmPaid: "Confirm the customer collected the order and paid, then close it.",
      confirmPaidLabel: "Collected and paid",
      checkedPaid: "I checked the number and amount; the customer collected and paid",
      confirmZero: "No payment is recorded. Check the order and confirm you told the customer.",
      checkedZero: "I checked the zero bill and told the customer",
      confirmNoShow:
        "The order closes as not collected: it records the amount not received, no payment. Try calling the customer first.",
      confirmNoShowLabel: "Close as not collected",
      checkedNoShow: "I checked the number and amount; the customer didn’t collect",
    },
    historyTitle: "Bill history",
    historyDescription:
      "Shows visits closed today. Search by closing date; bills stay as they were when closed.",
    refreshHistory: "Refresh history",
    fromDate: "Closed from",
    toDate: "Closed to",
    tableLabel: "Table (exact name)",
    closeReason: "Closing reason",
    all: "All",
    search: "Search",
    today: "Back to today",
    historyError: "Can’t update the history: reload.",
    historyDetail: "Details",
    historyDetailOf: (table) => `${table} · details`,
    loadingHistory: "Loading history…",
    historySummary: (from, to, zone, total, shown) =>
      `${from} to ${to} · ${zone} · ${plural(total, "visit", "visits")} · ${shown} shown`,
    noHistory: "No closed bills match these filters.",
    closedAt: (time) => `Closed: ${time}`,
    loadMoreHistory: "Load more bills",
  },
};
