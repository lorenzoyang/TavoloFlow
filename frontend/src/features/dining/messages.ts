import type { Language } from "@/lib/language";

const zh = {
  title: "桌台",
  refresh: "重新读取状态",
  suspended:
    "餐厅服务尚未由平台启用或已被暂停，暂不能开新桌；已有用餐仍可核对并关闭空桌。如需启用，请联系平台管理员。",
  suspendedHome:
    "餐厅服务尚未由平台启用或已被暂停：暂不能开桌，顾客扫码只能浏览菜单、不能点餐。如需启用，请联系平台管理员。",
  readError: "无法更新状态，请检查连接后重新读取。",
  verify: "核对操作结果",
  pending: (kind: "accepting" | "open") =>
    `${kind === "accepting" ? "接单设置结果待确认" : "开桌结果待确认"}，核对完成前暂停新的操作。`,
  accepting: "扫码接单",
  acceptingOn: "已开启：顾客可以扫码下单。",
  acceptingOff: "已暂停：不再接收新订单，已提交的订单仍可核对。",
  visit: "本轮用餐",
  loading: "正在读取桌位…",
  noTables: "还没有桌位",
  noTablesHint: "请先到「桌位与二维码」添加桌位。",
  tablesLink: "桌位与二维码",
  dining: (count: number) => `用餐中 ${count}`,
  free: (count: number) => `空桌 ${count}`,
  waiting: (count: number) => `待出餐 ${count} 项`,
  openTitle: (table: string) => `确认开桌 · ${table}`,
  openHint: "开桌后会生成本轮入桌码，请告知本桌顾客。",
  openHintNoCode: "开桌后顾客扫描本桌二维码即可直接加入点餐。",
  confirmOpen: "确认开桌",
  // Feedback.
  checkedAccepting: (enabled: boolean): string =>
    enabled ? "已核对：当前允许接单。" : "已核对：当前已暂停接单。",
  foundVisit: (codeRequired: boolean): string =>
    codeRequired
      ? "已查到本桌当前用餐，请核对桌号；可主动查看入桌码。"
      : "已查到本桌当前用餐，请核对桌号。",
  checkedFree: "已核对：当前为空桌。如需开桌，请重新确认。",
  tableGone: "此桌已不存在，请联系老板核对。",
  recoverUnknown: "暂时无法核对，请恢复连接后重新读取。",
  opened: (withCode: boolean): string =>
    withCode
      ? "开桌成功，请将本轮入桌码告知顾客。"
      : "开桌成功，顾客扫描本桌二维码即可直接加入点餐。",
  openUnknown: "开桌结果待确认。请重新读取状态；系统不会自动重发开桌。",
  acceptingSaved: (enabled: boolean): string =>
    enabled ? "已允许接单；实际下单仍须餐厅服务和桌位可用。" : "已暂停新增订单，既有订单仍可核对。",
  acceptingUnknown: "接单设置结果待确认，请重新读取状态。",
  // Table tiles and the selected visit.
  tileStatus: (newItems: number, amount: string) =>
    `用餐中，${newItems ? `待出餐 ${newItems} 项，` : ""}${amount}`,
  tileFree: "空桌，点按开桌",
  tile: (table: string, status: string) => `${table}：${status}`,
  freeShort: "空桌",
  disabled: "已停用",
  openedAt: (time: string) => `${time} 开桌`,
  loadingVisit: "正在读取本轮用餐…",
  active: "用餐中",
  ended: "本轮已结束",
  openedOn: (time: string) => `开桌：${time}`,
  orders: (count: number) => `已提交订单 ${count} 笔`,
  codeLabel: "本轮入桌码 · 仅告知本桌顾客",
  showCode: "查看入桌码",
};

export const diningMessages: Record<Language, typeof zh> = {
  zh,
  it: {
    title: "Sala",
    refresh: "Ricarica lo stato",
    suspended:
      "Il servizio del ristorante non è ancora attivo o è sospeso: non si possono aprire tavoli, ma le visite in corso restano consultabili e chiudibili. Per attivarlo contatta l’amministratore della piattaforma.",
    suspendedHome:
      "Il servizio del ristorante non è ancora attivo o è sospeso: non si possono aprire tavoli e i clienti possono solo consultare il menu. Per attivarlo contatta l’amministratore della piattaforma.",
    readError: "Impossibile aggiornare lo stato. Controlla la connessione e ricarica.",
    verify: "Verifica esito",
    pending: (kind) =>
      `${kind === "accepting" ? "Impostazione degli ordini" : "Apertura del tavolo"} da verificare: altre operazioni sospese fino alla verifica.`,
    accepting: "Ordini dal QR",
    acceptingOn: "Attivi: i clienti ordinano scansionando il QR.",
    acceptingOff: "In pausa: niente nuovi ordini; quelli inviati restano consultabili.",
    visit: "Visita",
    loading: "Caricamento tavoli…",
    noTables: "Nessun tavolo",
    noTablesHint: "Aggiungi prima i tavoli da «Tavoli e QR».",
    tablesLink: "Tavoli e QR",
    dining: (count) => `Occupati ${count}`,
    free: (count) => `Liberi ${count}`,
    waiting: (count) => `Da fare ${count}`,
    openTitle: (table) => `Apri il tavolo · ${table}`,
    openHint: "All’apertura viene creato il codice del tavolo: comunicalo ai clienti.",
    openHintNoCode: "Dopo l’apertura i clienti ordinano scansionando il QR del tavolo.",
    confirmOpen: "Apri tavolo",
    checkedAccepting: (enabled) =>
      enabled ? "Verificato: gli ordini sono attivi." : "Verificato: gli ordini sono in pausa.",
    foundVisit: (codeRequired) =>
      codeRequired
        ? "Visita in corso trovata: controlla il tavolo; puoi mostrare il codice."
        : "Visita in corso trovata: controlla il tavolo.",
    checkedFree: "Verificato: il tavolo è libero. Per aprirlo, conferma di nuovo.",
    tableGone: "Il tavolo non esiste più: chiedi al titolare di verificare.",
    recoverUnknown: "Impossibile verificare ora: ricarica quando torna la connessione.",
    opened: (withCode) =>
      withCode
        ? "Tavolo aperto: comunica il codice ai clienti."
        : "Tavolo aperto: i clienti ordinano scansionando il QR del tavolo.",
    openUnknown: "Apertura da verificare: ricarica lo stato. Non verrà ripetuta automaticamente.",
    acceptingSaved: (enabled) =>
      enabled
        ? "Ordini attivati; per ordinare servono comunque servizio e tavolo disponibili."
        : "Nuovi ordini in pausa; quelli già inviati restano consultabili.",
    acceptingUnknown: "Impostazione degli ordini da verificare: ricarica lo stato.",
    tileStatus: (newItems, amount) =>
      `Occupato, ${newItems ? `da fare ${newItems}, ` : ""}${amount}`,
    tileFree: "Libero, tocca per aprire",
    tile: (table, status) => `${table}: ${status}`,
    freeShort: "Libero",
    // A tile on a 360px phone is about 75px wide inside.
    disabled: "Inattivo",
    openedAt: (time) => `Aperto ${time}`,
    loadingVisit: "Caricamento della visita…",
    active: "In corso",
    ended: "Chiusa",
    openedOn: (time) => `Aperto: ${time}`,
    orders: (count) => `Ordini inviati: ${count}`,
    codeLabel: "Codice del tavolo · solo per i clienti di questo tavolo",
    showCode: "Mostra codice",
  },
  en: {
    title: "Floor",
    refresh: "Reload status",
    suspended:
      "The restaurant’s service isn’t active yet or is suspended: tables can’t be opened, but open visits can still be viewed and closed. To activate it, contact the platform administrator.",
    suspendedHome:
      "The restaurant’s service isn’t active yet or is suspended: tables can’t be opened and guests can only browse the menu. To activate it, contact the platform administrator.",
    readError: "Can’t update the status. Check the connection and reload.",
    verify: "Check result",
    pending: (kind) =>
      `${kind === "accepting" ? "Ordering setting" : "Table opening"} to be checked: other actions are paused until then.`,
    accepting: "QR ordering",
    acceptingOn: "On: guests order by scanning the QR code.",
    acceptingOff: "Paused: no new orders; orders already sent stay visible.",
    visit: "Visit",
    loading: "Loading tables…",
    noTables: "No tables",
    noTablesHint: "First add tables in «Tables & QR».",
    tablesLink: "Tables & QR",
    dining: (count) => `Occupied ${count}`,
    free: (count) => `Free ${count}`,
    waiting: (count) => `To do ${count}`,
    openTitle: (table) => `Open table · ${table}`,
    openHint: "Opening creates the table code: share it with the guests.",
    openHintNoCode: "Once open, guests order by scanning the table’s QR code.",
    confirmOpen: "Open table",
    checkedAccepting: (enabled) =>
      enabled ? "Checked: ordering is on." : "Checked: ordering is paused.",
    foundVisit: (codeRequired) =>
      codeRequired
        ? "Open visit found: check the table; you can show the code."
        : "Open visit found: check the table.",
    checkedFree: "Checked: the table is free. To open it, confirm again.",
    tableGone: "The table no longer exists: ask the owner to check.",
    recoverUnknown: "Can’t check right now: reload when the connection is back.",
    opened: (withCode) =>
      withCode
        ? "Table open: share the code with the guests."
        : "Table open: guests order by scanning the table’s QR code.",
    openUnknown: "Opening to be checked: reload the status. It won’t be repeated automatically.",
    acceptingSaved: (enabled) =>
      enabled
        ? "Ordering on; guests still need an active service and an available table."
        : "New orders paused; orders already sent stay visible.",
    acceptingUnknown: "Ordering setting to be checked: reload the status.",
    tileStatus: (newItems, amount) => `Occupied, ${newItems ? `to do ${newItems}, ` : ""}${amount}`,
    tileFree: "Free, tap to open",
    tile: (table, status) => `${table}: ${status}`,
    freeShort: "Free",
    disabled: "Inactive",
    openedAt: (time) => `Opened ${time}`,
    loadingVisit: "Loading the visit…",
    active: "Open",
    ended: "Closed",
    openedOn: (time) => `Opened: ${time}`,
    orders: (count) => `Orders sent: ${count}`,
    codeLabel: "Table code · only for this table’s guests",
    showCode: "Show code",
  },
};
