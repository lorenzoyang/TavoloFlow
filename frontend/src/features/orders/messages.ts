import type { Language } from "@/lib/language";

const en = {
  add: "Add to cart",
  cart: "Your cart",
  cartHint:
    "The cart is only on this phone: others at the table can’t see it, and closing the page empties it.",
  empty: "Your cart is empty.",
  quantity: "Quantity",
  remark: "Note",
  remarkPlaceholder: "Note, e.g. no onion",
  remove: "Remove",
  decrease: "Decrease quantity",
  increase: "Increase quantity",
  total: "Total",
  // How many portions the cart holds, and a line's price for one portion.
  portionCount: (count: number) => (count === 1 ? "1 item" : `${count} items`),
  unitPrice: (price: string) => `${price} each`,
  review: "Review order",
  confirm: "Confirm and place order",
  back: "Back to cart",
  confirming: "Confirm your order",
  reviewHint: "Check the table, items, notes and current prices before placing your order.",
  newVisit:
    "This table was opened after you started browsing. Confirm that this cart belongs to the visit shown here.",
  busy: "Working…",
  unknown:
    "We can’t confirm yet whether the order went through, so the cart can’t be changed for now. Tap «Check order result»; if it didn’t, «Send again» won’t order twice.",
  lookup: "Check order result",
  retry: "Send again",
  notFound:
    "No result found yet. That doesn’t mean the order failed: check again later or tap «Send again».",
  success: "Order received",
  unverified: "Join this visit before reviewing and placing your order.",
  changed: "The menu has changed. Review the latest prices and availability, then confirm again.",
  unavailable:
    "Some dishes are unavailable or awaiting allergen review. Remove or replace them before ordering.",
  options:
    "Some choices (size, toppings…) have changed or sold out. Remove those items and add them again.",
  optionsChanged: "These choices have changed. Remove the item and add it again.",
  rule: (min: number, max: number) =>
    min > 0
      ? max === 1
        ? "Required · choose 1"
        : min === max
          ? `Required · choose ${max}`
          : `Required · ${min}–${max}`
      : max === 1
        ? "Optional"
        : `Optional · up to ${max}`,
  chooseGroups: (names: string) => `Choose: ${names}`,
  addFor: (price: string) => `Add to cart · ${price}`,
  fromPrice: (price: string) => `from ${price}`,
  // Read by screen readers before the struck-through price of a dish on sale.
  regularPrice: "Regular price",
  extra: (price: string) => `+${price}`,
  choices: "Choose options",
  limits: "Use up to 30 lines, 1–20 per line and 100 items total. Item notes: 200 characters.",
  amount: "The amount exceeds the supported range. Please ask the staff.",
  storage:
    "Your browser cannot save the order safely. Enable tab storage and reload before ordering. You may still browse and edit.",
  damaged:
    "The saved cart or pending request could not be read safely. Please ask staff to check any previous order before continuing.",
  endedPending:
    "This visit has ended. If an order was awaiting confirmation, ask staff to check it. Nothing will be sent to a new visit.",
  offline: "Connection or result could not be confirmed. Reconnect and check the original result.",
  paused: "The restaurant is not accepting new orders. Existing orders can still be checked.",
  suspended:
    "QR ordering isn’t available at this restaurant right now. Existing orders can still be checked.",
  disabled: "This table is disabled for new orders. Please contact staff.",
  auth: "Verify the original visit again to recover your cart or pending order.",
  csrf: "Page verification changed. Please review and try again.",
  generic: "Unable to complete this operation. Please check your connection or ask staff.",
  orders: "This table’s orders",
  ordersHint: "Submitted orders from everyone at this table. Unsubmitted carts stay private.",
  refresh: "Refresh orders",
  more: "Load earlier orders",
  noOrders: "No orders submitted yet.",
  NEW: "Received",
  READY: "Ready for pickup",
  PROCESSED: "Processed",
  notCharged: "Not charged",
  originalTotal: "Original total",
  payable: "Amount due",
  CANCELLED: "Cancelled",
  effectiveTotal: "Table total, excluding cancelled orders",
  stale: "Update failed. The orders shown may be out of date.",
  updated: "Last updated",
  allergies: "Allergen information",
  viewCart: "View cart",
  keepOrdering: "Keep ordering",
  menuTab: "Menu",
  close: "Close",
};

export const orderMessages: Record<Language, typeof en> = {
  en,
  zh: {
    add: "加入购物车",
    cart: "我的购物车",
    cartHint: "购物车只在你的手机上，同桌其他人看不到；关闭页面后会清空。",
    empty: "购物车还是空的。",
    quantity: "数量",
    remark: "备注",
    remarkPlaceholder: "备注，如：不要香菜",
    remove: "移除",
    decrease: "减少数量",
    increase: "增加数量",
    total: "合计",
    portionCount: (count) => `${count} 份`,
    unitPrice: (price) => `${price} / 份`,
    review: "核对订单",
    confirm: "确认并下单",
    back: "返回购物车",
    confirming: "确认本次订单",
    reviewHint: "请核对桌号、菜品、备注和最新价格，确认后正式下单。",
    newVisit: "此桌在你开始浏览后才开桌，请确认这些菜品属于当前这一轮用餐。",
    busy: "处理中…",
    unknown:
      "暂时无法确认是否已下单，在此之前购物车不能修改。请点「核对下单结果」；如果还没下单，可以「重新提交」，不会重复下单。",
    lookup: "核对下单结果",
    retry: "重新提交",
    notFound: "暂未查到这一单，这不代表下单失败。可以稍后再核对，或点「重新提交」。",
    success: "订单已收到",
    unverified: "请先加入本轮用餐，再核对并提交订单。",
    changed: "菜单已变化，请重新核对最新价格和供应状态，再确认下单。",
    unavailable: "部分菜品已不可售或尚未完成过敏原审核，请移除或替换后再下单。",
    options: "部分菜品的规格或加料已变更或售罄，请移除这些菜品后重新添加。",
    optionsChanged: "这些选项已变更，请移除后重新添加。",
    rule: (min, max) =>
      min > 0
        ? max === 1
          ? "必选 · 单选"
          : min === max
            ? `必选 · 选 ${max} 项`
            : `必选 · 选 ${min}–${max} 项`
        : max === 1
          ? "可选"
          : `可选 · 最多 ${max} 项`,
    chooseGroups: (names) => `请选择：${names}`,
    addFor: (price) => `加入购物车 · ${price}`,
    fromPrice: (price) => `${price} 起`,
    regularPrice: "原价",
    extra: (price) => `+${price}`,
    choices: "选择规格",
    limits: "每单最多 30 行，每行 1–20 份，总计最多 100 份；备注最多 200 字符。",
    amount: "金额超过支持范围，请联系工作人员。",
    storage: "浏览器无法安全保存本次订单。请启用标签页存储并刷新后下单；仍可浏览和编辑。",
    damaged: "无法安全读取已保存的购物车或待确认请求，请联系工作人员核对之前的订单。",
    endedPending: "本轮用餐已结束。如有待确认订单，请由工作人员核对；不会发送到下一轮用餐。",
    offline: "连接或结果尚未确认，请恢复网络后核对原请求。",
    paused: "餐厅已暂停新增订单，仍可核对已提交订单。",
    suspended: "本餐厅暂未开放扫码点餐，仍可核对已提交订单。",
    disabled: "此桌已停用，无法提交新订单，请联系工作人员。",
    auth: "请重新加入原用餐，以恢复购物车或待确认订单。",
    csrf: "页面验证已变化，请重新核对后再试。",
    generic: "暂时无法完成操作，请检查网络或联系工作人员。",
    orders: "本桌订单",
    ordersHint: "这里显示同桌所有顾客已提交的订单，不包含各自尚未提交的购物车。",
    refresh: "刷新本桌订单",
    more: "加载更早订单",
    noOrders: "本桌暂未提交订单。",
    NEW: "已收到",
    READY: "已出餐",
    PROCESSED: "已处理",
    notCharged: "不计应收",
    originalTotal: "原订单金额",
    payable: "应收",
    CANCELLED: "已取消",
    effectiveTotal: "本桌有效订单合计（不含已取消订单）",
    stale: "订单更新失败，当前显示上次读取的内容。",
    updated: "最后更新",
    allergies: "过敏原信息",
    viewCart: "查看购物车",
    keepOrdering: "继续点菜",
    menuTab: "点菜",
    close: "关闭",
  },
  it: {
    add: "Aggiungi al carrello",
    cart: "Il tuo carrello",
    cartHint:
      "Il carrello è solo su questo telefono: gli altri al tavolo non lo vedono, e si svuota se chiudi la pagina.",
    empty: "Il carrello è vuoto.",
    quantity: "Quantità",
    remark: "Nota",
    remarkPlaceholder: "Nota, es. senza cipolla",
    remove: "Rimuovi",
    decrease: "Riduci quantità",
    increase: "Aumenta quantità",
    total: "Totale",
    portionCount: (count) => (count === 1 ? "1 porzione" : `${count} porzioni`),
    unitPrice: (price) => `${price} / porzione`,
    review: "Controlla ordine",
    confirm: "Conferma e ordina",
    back: "Torna al carrello",
    confirming: "Conferma il tuo ordine",
    reviewHint: "Controlla tavolo, piatti, note e prezzi aggiornati prima di ordinare.",
    newVisit:
      "Il tavolo è stato aperto dopo l’inizio della consultazione. Conferma che il carrello appartiene alla visita indicata.",
    busy: "Attendi…",
    unknown:
      "Non sappiamo ancora se l’ordine è partito: fino ad allora il carrello non si può modificare. Tocca «Verifica esito ordine»; se non è partito, «Invia di nuovo» non lo manda due volte.",
    lookup: "Verifica esito ordine",
    retry: "Invia di nuovo",
    notFound:
      "Ordine non ancora trovato: non significa che sia fallito. Puoi ricontrollare più tardi o toccare «Invia di nuovo».",
    success: "Ordine ricevuto",
    unverified: "Unisciti al tavolo prima di controllare e inviare l’ordine.",
    changed:
      "Il menu è cambiato. Controlla prezzi e disponibilità aggiornati e conferma nuovamente.",
    unavailable:
      "Alcuni piatti non sono disponibili o attendono la verifica degli allergeni. Rimuovili o sostituiscili.",
    options:
      "Alcune scelte (formato, topping…) sono cambiate o esaurite. Rimuovi quei piatti e aggiungili di nuovo.",
    optionsChanged: "Queste scelte sono cambiate. Rimuovi il piatto e aggiungilo di nuovo.",
    rule: (min, max) =>
      min > 0
        ? max === 1
          ? "Obbligatorio · 1 scelta"
          : min === max
            ? `Obbligatorio · ${max} scelte`
            : `Obbligatorio · da ${min} a ${max}`
        : max === 1
          ? "Facoltativo"
          : `Facoltativo · fino a ${max}`,
    chooseGroups: (names) => `Scegli: ${names}`,
    addFor: (price) => `Aggiungi · ${price}`,
    fromPrice: (price) => `da ${price}`,
    regularPrice: "Prezzo pieno",
    extra: (price) => `+${price}`,
    choices: "Scegli le opzioni",
    limits:
      "Massimo 30 righe, 1–20 porzioni per riga e 100 in totale. Note: 200 caratteri per piatto.",
    amount: "L’importo supera il limite supportato. Rivolgiti al personale.",
    storage:
      "Il browser non può salvare l’ordine in sicurezza. Abilita la memoria della scheda e ricarica prima di ordinare. Puoi consultare e modificare la bozza.",
    damaged:
      "Impossibile leggere in sicurezza il carrello o la richiesta salvata. Chiedi al personale di verificare eventuali ordini precedenti.",
    endedPending:
      "La visita è terminata. Chiedi al personale di verificare eventuali ordini in attesa. Nulla sarà inviato a una nuova visita.",
    offline: "Connessione o esito non confermati. Riconnettiti e verifica la richiesta originale.",
    paused: "Il ristorante non accetta nuovi ordini. Puoi verificare quelli già inviati.",
    suspended:
      "Gli ordini tramite QR non sono disponibili al momento. Puoi verificare quelli già inviati.",
    disabled: "Il tavolo non accetta nuovi ordini. Rivolgiti al personale.",
    auth: "Unisciti di nuovo alla visita originale per recuperare carrello o ordine in attesa.",
    csrf: "La verifica della pagina è cambiata. Controlla e riprova.",
    generic: "Operazione non disponibile. Controlla la connessione o chiedi al personale.",
    orders: "Ordini del tavolo",
    ordersHint: "Ordini inviati da tutti i commensali. I carrelli non inviati restano privati.",
    refresh: "Aggiorna ordini",
    more: "Carica ordini precedenti",
    noOrders: "Nessun ordine ancora inviato.",
    NEW: "Ricevuto",
    READY: "Pronto in cucina",
    PROCESSED: "Gestito",
    notCharged: "Non addebitato",
    originalTotal: "Totale originale",
    payable: "Da pagare",
    CANCELLED: "Annullato",
    effectiveTotal: "Totale del tavolo, esclusi gli ordini annullati",
    stale: "Aggiornamento non riuscito. Gli ordini visualizzati potrebbero non essere aggiornati.",
    updated: "Ultimo aggiornamento",
    allergies: "Informazioni sugli allergeni",
    viewCart: "Vedi carrello",
    keepOrdering: "Continua a ordinare",
    menuTab: "Menu",
    close: "Chiudi",
  },
};
// The notices a cart can show: every plain-text message, not the formatting functions.
export type OrderMessage = {
  [K in keyof typeof en]: (typeof en)[K] extends string ? K : never;
}[keyof typeof en];
export const orderError = (code: string): OrderMessage =>
  (
    ({
      MENU_CHANGED: "changed",
      ORDERING_PAUSED: "paused",
      SERVICE_SUSPENDED: "suspended",
      DINE_IN_NOT_OFFERED: "suspended",
      TABLE_DISABLED: "disabled",
      GUEST_AUTH_REQUIRED: "auth",
      GUEST_SESSION_MISMATCH: "auth",
      GUEST_ACCESS_DENIED: "auth",
      CSRF_VALIDATION_FAILED: "csrf",
      VALIDATION_FAILED: "limits",
      BILL_LIMIT_REACHED: "amount",
      ORDER_NOT_FOUND: "notFound",
    }) as Record<string, OrderMessage>
  )[code] ?? "generic";
