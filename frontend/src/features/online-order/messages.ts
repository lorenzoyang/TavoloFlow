import type { Language } from "@/lib/language";
import type { StatusCopy } from "./state";

const zh = {
  // Menu page
  title: "线上点单",
  loading: "正在读取菜单…",
  invalidLink: "这个线上点单链接无效。请向餐厅确认链接。",
  error: "暂时无法读取菜单，请检查网络后重试。",
  stale: "更新失败，显示的菜单和接单状态可能不是最新的。",
  retry: "重试",
  call: "致电餐厅",
  callNumber: (phone: string) => `拨打 ${phone}`,
  pickupOnly: "到店自取",
  pickupOrDelivery: "到店自取或配送",
  open: "订单尽快制作，不能预约时间；餐厅确认后会显示预计时间。",
  busy: "餐厅现在待处理的订单太多，暂时无法线上下单。请稍后再试，或致电餐厅。",
  paused: "餐厅暂停了线上接单。可以先看菜单，稍后再来，或致电餐厅。",
  closedHours: (when: string) => `现在不在线上接单时间内，${when} 开始接单。可以先看菜单。`,
  closedNoHours: "现在不在线上接单时间内。可以先看菜单。",
  notOffered: "这家餐厅现在不接受线上点单，这里只显示菜单。",
  suspended: "这家餐厅的服务已暂停，暂时无法线上下单。",
  activeOrder: "你有一个进行中的订单。",
  viewOrder: "查看订单",
  privacy: "隐私说明",
  // Cart and checkout
  cart: "购物车",
  cartHint: "购物车只保存在这个标签页。",
  empty: "购物车是空的。",
  checkout: "去结账",
  checkoutTitle: "确认订单",
  back: "返回购物车",
  placeOrder: "提交订单",
  working: "正在处理…",
  total: "合计",
  name: "姓名",
  phone: "电话",
  phoneHint: "餐厅可能会打电话确认订单。",
  nameProblem: "请填写姓名（最多 30 个字符）。",
  phoneProblem: "请填写电话：可选的 + 和 6–15 位数字。",
  fulfillment: "取餐方式",
  pickup: "到店自取",
  delivery: "配送",
  address: "配送地址",
  addressProblem: "请填写配送地址（最多 200 个字符）。",
  deliveryNotes: "门铃、楼层（选填）",
  deliveryNotesProblem: "门铃、楼层备注最多 100 个字符。",
  deliveryNoteTitle: "配送说明",
  feeConfirmed: "配送费以餐厅确认为准，接单后显示在订单页。",
  itemsTotal: "菜品合计",
  subtotal: "小计",
  coupon: "优惠码（选填）",
  couponHint: "填写餐厅分享的优惠码，只减菜品金额，不含配送费。",
  applyCoupon: "使用",
  removeCoupon: "移除",
  couponApplied: (code: string, percent: number) => `优惠码 ${code}（−${percent}%）`,
  couponInvalid: "这个优惠码不能使用：可能输错了或已过期。请检查后再试，或不用优惠码下单。",
  asap: "订单尽快制作，不能预约时间。餐厅确认后，订单页会显示预计取餐时间。",
  asapDelivery: "订单尽快制作和配送，不能预约时间。餐厅确认后，订单页会显示配送费和预计送达时间。",
  privacyLine: (restaurant: string) =>
    `你的姓名和电话只交给 ${restaurant} 处理这一单，30 天后删除。`,
  privacyLineDelivery: (restaurant: string) =>
    `你的姓名、电话和地址只交给 ${restaurant} 处理这一单，30 天后删除。`,
  unknown: "订单结果待确认。在查到原来的结果之前，购物车已锁定，不会重复下单。",
  lookup: "查询订单结果",
  retryOriginal: "重试原来的订单",
  // Submission problems; each notice also offers the restaurant's phone
  changed: "菜单有变化，请检查最新的价格和供应情况，再提交。",
  closed: "现在不在线上接单时间内，订单没有提交。",
  linkGone: "这个线上点单链接已失效，订单没有提交。",
  invalid: "请检查姓名、电话、地址和菜品数量。",
  deliveryOff: "餐厅现在不提供配送，可以改为到店自取。",
  csrf: "页面验证已过期，请再提交一次。",
  rateLimited: "提交次数太多，请稍后再试。",
  notFound: "还没有查到结果。这不表示订单失败，可以稍后再查，或重试原来的订单。",
  offline: "网络或结果无法确认。请恢复网络后查询原来的订单结果。",
  generic: "操作没有完成。请检查网络，或致电餐厅。",
  limits: "最多 30 行、每行 1–20 份、总共 100 份；菜品备注最多 200 个字符。",
  amount: "金额超出支持的范围，请致电餐厅。",
  unavailable: "部分菜品已售完或暂不供应，请删除或替换后再提交。",
  options: "部分规格（大小、加料等）有变化或已售完，请删除这些菜品后重新添加。",
  storage: "浏览器无法安全保存订单。请允许本标签页存储后重新打开页面；仍可浏览和编辑。",
  damaged: "保存的购物车无法安全读取。如果之前提交过订单，请先致电餐厅确认。",
  // Status page
  orderTitle: "订单状态",
  orderNumber: (number: number) => `#${number}`,
  pickupFor: (name: string) => `到店自取 · ${name}`,
  deliveryFor: (name: string) => `配送 · ${name}`,
  feePending: "配送费待餐厅确认",
  deliveryFee: "配送费",
  numberLabel: "订单号",
  submittedAt: (time: string) => `提交于 ${time}`,
  accepted: "已接单",
  pickupAround: "预计可取时间，请尽快前来",
  deliveryAround: "预计送达时间",
  items: "菜品",
  cancelled: "已取消",
  notCharged: "不收费",
  remark: "备注",
  refresh: "刷新",
  updating: "页面会自动更新。",
  backToMenu: "返回菜单",
  ended: "订单已结束，或者这个订单链接无效。",
  orderError: "暂时无法读取订单状态，请检查网络后重试。",
  orderStale: "更新失败，显示的状态可能不是最新的。",
  waitingHint: (time: string) => `餐厅会在 ${time} 前确认。`,
  cannotCancel: "如需修改或取消订单，请致电餐厅。",
  status: {
    waiting: "已提交，等待餐厅确认",
    expired: "餐厅未能及时确认，订单未生效。请致电餐厅，或重新下单。",
    rejectedSoldOut: "餐厅无法接单：部分菜品已售完。",
    rejectedBusy: "餐厅无法接单：餐厅现在太忙。",
    rejectedClosing: "餐厅无法接单：餐厅即将打烊。",
    rejectedOutOfRange: "餐厅无法接单：超出配送范围。",
    rejectedNoReason: "餐厅暂时无法接单。",
    preparingPickup: "已接单，请按预计时间前来取餐",
    preparingDelivery: "已接单，正在准备",
    readyPickup: "可以取餐了",
    readyDelivery: "餐已做好，准备送出",
    allCancelled: "订单菜品已全部取消，请联系餐厅。",
    collectedPickup: "已取餐",
    collectedDelivery: "已送达",
    closed: "订单已关闭",
  } satisfies Record<StatusCopy, string>,
  // Privacy page
  privacyTitle: "隐私说明",
  privacySections: (restaurant: string, phone: string | null) => [
    {
      heading: "谁处理你的数据",
      body: `数据控制者是 ${restaurant}${phone ? `（电话 ${phone}）` : ""}。TavoloFlow 为餐厅提供点单软件，作为处理者只按餐厅的指示处理这些数据。`,
    },
    {
      heading: "收集哪些数据",
      body: "你下单时填写的姓名和电话；选择配送时还有地址和门铃、楼层备注。",
    },
    {
      heading: "用途和法律依据",
      body: "只用于处理你这一单：确认订单、准备菜品、通知你取餐或送餐。法律依据是履行你自己下的订单（GDPR 第 6 条第 1 款 b 项），所以不需要另外勾选同意。",
    },
    {
      heading: "保存多久",
      body: "姓名、电话和地址在提交 30 天后删除；订单的菜品和金额作为餐厅的账目保留，不再与你的联系方式关联。",
    },
    {
      heading: "你的权利",
      body: "你可以要求查看、更正或删除你的数据，或限制、反对处理。请直接联系餐厅。你也可以向意大利个人数据保护机构（Garante per la protezione dei dati personali）投诉。",
    },
    {
      heading: "浏览器存储",
      body: "本页只使用技术上必需的存储：购物车、语言选择、订单状态链接和防伪验证的 Cookie。没有统计、广告或第三方追踪。",
    },
  ],
};

export const onlineOrderMessages: Record<Language, typeof zh> = {
  zh,
  it: {
    title: "Ordini online",
    loading: "Caricamento del menu…",
    invalidLink: "Questo link per ordinare online non è valido. Verificalo con il ristorante.",
    error: "Non riesco a caricare il menu. Controlla la connessione e riprova.",
    stale:
      "Aggiornamento non riuscito: menu e stato degli ordini potrebbero non essere aggiornati.",
    retry: "Riprova",
    call: "Chiama il ristorante",
    callNumber: (phone) => `Chiama ${phone}`,
    pickupOnly: "Ritiro al ristorante",
    pickupOrDelivery: "Ritiro o consegna a domicilio",
    open: "Prepariamo l’ordine appena possibile, senza orari su prenotazione; dopo la conferma vedrai l’orario previsto.",
    busy: "Il ristorante ha troppi ordini in attesa: per ora non si può ordinare online. Riprova tra poco o chiama il ristorante.",
    paused:
      "Il ristorante ha messo in pausa gli ordini online. Puoi guardare il menu, tornare più tardi o chiamare.",
    closedHours: (when) =>
      `Ora siamo fuori dall’orario degli ordini online: riaprono ${when}. Intanto puoi guardare il menu.`,
    closedNoHours:
      "Ora siamo fuori dall’orario degli ordini online. Intanto puoi guardare il menu.",
    notOffered: "Questo ristorante ora non accetta ordini online: qui c’è solo il menu.",
    suspended: "Il servizio del ristorante è sospeso: per ora non si può ordinare online.",
    activeOrder: "Hai un ordine in corso.",
    viewOrder: "Vedi l’ordine",
    privacy: "Privacy",
    cart: "Carrello",
    cartHint: "Il carrello resta solo in questa scheda.",
    empty: "Il carrello è vuoto.",
    checkout: "Vai alla cassa",
    checkoutTitle: "Conferma l’ordine",
    back: "Torna al carrello",
    placeOrder: "Invia l’ordine",
    working: "Un momento…",
    total: "Totale",
    name: "Nome",
    phone: "Telefono",
    phoneHint: "Il ristorante potrebbe chiamarti per confermare l’ordine.",
    nameProblem: "Inserisci il nome (al massimo 30 caratteri).",
    phoneProblem: "Inserisci il telefono: un + facoltativo e 6–15 cifre.",
    fulfillment: "Come lo ricevi",
    pickup: "Ritiro",
    delivery: "Consegna",
    address: "Indirizzo di consegna",
    addressProblem: "Inserisci l’indirizzo di consegna (al massimo 200 caratteri).",
    deliveryNotes: "Citofono, piano (facoltativo)",
    deliveryNotesProblem: "Citofono e piano: al massimo 100 caratteri.",
    deliveryNoteTitle: "Consegna",
    feeConfirmed:
      "Il costo di consegna lo conferma il ristorante: lo vedrai nella pagina dell’ordine dopo l’accettazione.",
    itemsTotal: "Totale piatti",
    subtotal: "Subtotale",
    coupon: "Codice sconto (facoltativo)",
    couponHint:
      "Il codice condiviso dal ristorante: lo sconto vale sui piatti, non sulla consegna.",
    applyCoupon: "Applica",
    removeCoupon: "Rimuovi",
    couponApplied: (code, percent) => `Codice ${code} (−${percent}%)`,
    couponInvalid:
      "Questo codice sconto non si può usare: forse è sbagliato o scaduto. Controllalo, oppure ordina senza codice.",
    asap: "Prepariamo l’ordine appena possibile, senza orari su prenotazione. Dopo la conferma, la pagina dell’ordine mostra l’orario previsto per il ritiro.",
    asapDelivery:
      "Prepariamo e consegniamo l’ordine appena possibile, senza orari su prenotazione. Dopo la conferma, la pagina dell’ordine mostra il costo di consegna e l’orario previsto.",
    privacyLine: (restaurant) =>
      `Nome e telefono vanno solo a ${restaurant} per questo ordine e si cancellano dopo 30 giorni.`,
    privacyLineDelivery: (restaurant) =>
      `Nome, telefono e indirizzo vanno solo a ${restaurant} per questo ordine e si cancellano dopo 30 giorni.`,
    unknown:
      "L’esito dell’ordine va verificato. Il carrello resta bloccato finché non si conosce l’esito dell’invio originale, così non parte un doppione.",
    lookup: "Verifica l’esito",
    retryOriginal: "Riprova lo stesso ordine",
    changed: "Il menu è cambiato: controlla prezzi e disponibilità aggiornati, poi invia di nuovo.",
    closed: "Ora siamo fuori dall’orario degli ordini online: l’ordine non è stato inviato.",
    linkGone: "Questo link per ordinare online non vale più: l’ordine non è stato inviato.",
    invalid: "Controlla nome, telefono, indirizzo e quantità.",
    deliveryOff: "Ora il ristorante non fa consegne: puoi scegliere il ritiro.",
    csrf: "La verifica della pagina è scaduta: invia di nuovo.",
    rateLimited: "Troppi invii: riprova tra poco.",
    notFound:
      "Ancora nessun esito. Non significa che l’ordine sia fallito: puoi verificare più tardi o riprovare lo stesso ordine.",
    offline:
      "Connessione o esito non confermati. Torna online e verifica l’esito dell’ordine originale.",
    generic: "Operazione non riuscita. Controlla la connessione o chiama il ristorante.",
    limits:
      "Al massimo 30 righe, 1–20 per riga e 100 porzioni in tutto; note fino a 200 caratteri.",
    amount: "L’importo supera il limite consentito: chiama il ristorante.",
    unavailable:
      "Alcuni piatti sono esauriti o non disponibili: toglili o sostituiscili prima di inviare.",
    options:
      "Alcune scelte (formato, aggiunte…) sono cambiate o esaurite: togli quei piatti e aggiungili di nuovo.",
    storage:
      "Il browser non può salvare l’ordine in modo sicuro. Abilita la memoria della scheda e riapri la pagina; puoi comunque guardare e modificare.",
    damaged:
      "Il carrello salvato non si legge in modo sicuro. Se avevi già inviato un ordine, chiama prima il ristorante.",
    orderTitle: "Stato dell’ordine",
    orderNumber: (number) => `N. ${number}`,
    pickupFor: (name) => `Ritiro · ${name}`,
    deliveryFor: (name) => `Consegna · ${name}`,
    feePending: "Costo di consegna da confermare",
    deliveryFee: "Consegna",
    numberLabel: "Ordine",
    submittedAt: (time) => `Inviato alle ${time}`,
    accepted: "Ordine accettato",
    pickupAround: "Ritiro previsto: passa appena puoi",
    deliveryAround: "Consegna prevista",
    items: "Piatti",
    cancelled: "Annullato",
    notCharged: "Non addebitato",
    remark: "Nota",
    refresh: "Aggiorna",
    updating: "La pagina si aggiorna da sola.",
    backToMenu: "Torna al menu",
    ended: "L’ordine è concluso, oppure questo link non è valido.",
    orderError: "Non riesco a leggere lo stato dell’ordine. Controlla la connessione e riprova.",
    orderStale: "Aggiornamento non riuscito: lo stato potrebbe non essere aggiornato.",
    waitingHint: (time) => `Il ristorante risponde entro le ${time}.`,
    cannotCancel: "Per modificare o annullare l’ordine, chiama il ristorante.",
    status: {
      waiting: "Inviato, in attesa di conferma",
      expired:
        "Il ristorante non ha confermato in tempo: l’ordine non è valido. Chiama il ristorante o ordina di nuovo.",
      rejectedSoldOut: "Il ristorante non può accettare: alcuni piatti sono esauriti.",
      rejectedBusy: "Il ristorante non può accettare: ora è troppo pieno.",
      rejectedClosing: "Il ristorante non può accettare: sta per chiudere.",
      rejectedOutOfRange:
        "Il ristorante non può accettare: indirizzo fuori dalla zona di consegna.",
      rejectedNoReason: "Il ristorante per ora non può accettare l’ordine.",
      preparingPickup: "Ordine accettato: passa all’orario previsto",
      preparingDelivery: "Ordine accettato, in preparazione",
      readyPickup: "Pronto da ritirare",
      readyDelivery: "Pronto, sta per partire",
      allCancelled: "Tutti i piatti dell’ordine sono stati annullati: contatta il ristorante.",
      collectedPickup: "Ritirato",
      collectedDelivery: "Consegnato",
      closed: "Ordine chiuso",
    },
    privacyTitle: "Informativa privacy",
    privacySections: (restaurant, phone) => [
      {
        heading: "Chi tratta i tuoi dati",
        body: `Il titolare del trattamento è ${restaurant}${phone ? ` (telefono ${phone})` : ""}. TavoloFlow fornisce al ristorante il software per gli ordini e, come responsabile del trattamento, tratta i dati solo secondo le sue istruzioni.`,
      },
      {
        heading: "Quali dati",
        body: "Il nome e il telefono che inserisci quando ordini; per una consegna anche l’indirizzo e le note su citofono e piano.",
      },
      {
        heading: "Finalità e base giuridica",
        body: "Servono solo a gestire il tuo ordine: confermarlo, prepararlo e avvisarti per il ritiro o la consegna. La base giuridica è l’esecuzione dell’ordine che fai tu (art. 6, par. 1, lett. b del GDPR), quindi non serve un consenso separato.",
      },
      {
        heading: "Per quanto tempo",
        body: "Nome, telefono e indirizzo si cancellano 30 giorni dopo l’invio; piatti e importi dell’ordine restano nella contabilità del ristorante, senza i tuoi contatti.",
      },
      {
        heading: "I tuoi diritti",
        body: "Puoi chiedere di accedere ai tuoi dati, correggerli o cancellarli, oppure limitarne o opporti al trattamento, contattando direttamente il ristorante. Puoi anche presentare reclamo al Garante per la protezione dei dati personali.",
      },
      {
        heading: "Memoria del browser",
        body: "Questa pagina usa solo la memoria tecnicamente necessaria: carrello, lingua scelta, link allo stato dell’ordine e il cookie di verifica anti-falsificazione. Nessuna statistica, pubblicità o tracciamento di terzi.",
      },
    ],
  },
  en: {
    title: "Online ordering",
    loading: "Loading the menu…",
    invalidLink: "This online ordering link isn’t valid. Please check it with the restaurant.",
    error: "The menu couldn’t be loaded. Check your connection and try again.",
    stale: "Update failed: the menu and ordering status may be out of date.",
    retry: "Try again",
    call: "Call the restaurant",
    callNumber: (phone) => `Call ${phone}`,
    pickupOnly: "Pickup at the restaurant",
    pickupOrDelivery: "Pickup or delivery",
    open: "Orders are made as soon as possible; you can’t book a time. Once the restaurant confirms, you’ll see the expected time.",
    busy: "The restaurant has too many orders waiting, so online ordering is closed for now. Try again shortly or call the restaurant.",
    paused:
      "The restaurant has paused online orders. You can browse the menu, come back later or call.",
    closedHours: (when) =>
      `Online ordering is outside its hours right now and opens ${when}. You can still browse the menu.`,
    closedNoHours: "Online ordering is outside its hours right now. You can still browse the menu.",
    notOffered: "This restaurant isn’t taking online orders right now; this is just the menu.",
    suspended: "This restaurant’s service is suspended, so online ordering isn’t available.",
    activeOrder: "You have an order in progress.",
    viewOrder: "View order",
    privacy: "Privacy",
    cart: "Your cart",
    cartHint: "The cart stays in this tab only.",
    empty: "Your cart is empty.",
    checkout: "Checkout",
    checkoutTitle: "Confirm your order",
    back: "Back to cart",
    placeOrder: "Place order",
    working: "Working…",
    total: "Total",
    name: "Name",
    phone: "Phone",
    phoneHint: "The restaurant may call you to confirm the order.",
    nameProblem: "Enter your name (up to 30 characters).",
    phoneProblem: "Enter your phone: an optional + and 6–15 digits.",
    fulfillment: "How you get it",
    pickup: "Pickup",
    delivery: "Delivery",
    address: "Delivery address",
    addressProblem: "Enter the delivery address (up to 200 characters).",
    deliveryNotes: "Doorbell, floor (optional)",
    deliveryNotesProblem: "Doorbell and floor: up to 100 characters.",
    deliveryNoteTitle: "Delivery",
    feeConfirmed:
      "The restaurant confirms the delivery fee; you’ll see it on the order page once accepted.",
    itemsTotal: "Items total",
    subtotal: "Subtotal",
    coupon: "Coupon code (optional)",
    couponHint:
      "A code shared by the restaurant: it takes money off the dishes, not the delivery fee.",
    applyCoupon: "Apply",
    removeCoupon: "Remove",
    couponApplied: (code, percent) => `Coupon ${code} (−${percent}%)`,
    couponInvalid:
      "This coupon code can’t be used: it may be mistyped or expired. Check it, or order without a code.",
    asap: "Orders are made as soon as possible; you can’t book a time. Once the restaurant confirms, the order page shows when to collect.",
    asapDelivery:
      "Orders are made and delivered as soon as possible; you can’t book a time. Once the restaurant confirms, the order page shows the delivery fee and expected time.",
    privacyLine: (restaurant) =>
      `Your name and phone go only to ${restaurant} for this order and are deleted after 30 days.`,
    privacyLineDelivery: (restaurant) =>
      `Your name, phone and address go only to ${restaurant} for this order and are deleted after 30 days.`,
    unknown:
      "The order result needs checking. The cart stays locked until the original result is known, so nothing is sent twice.",
    lookup: "Check the result",
    retryOriginal: "Retry the same order",
    changed: "The menu has changed. Check the latest prices and availability, then send again.",
    closed: "Online ordering is outside its hours right now; the order wasn’t sent.",
    linkGone: "This online ordering link no longer works; the order wasn’t sent.",
    invalid: "Check the name, phone, address and quantities.",
    deliveryOff: "The restaurant isn’t delivering right now; you can choose pickup.",
    csrf: "The page check expired. Please send again.",
    rateLimited: "Too many attempts. Try again shortly.",
    notFound:
      "No result found yet. That doesn’t mean the order failed: check again later or retry the same order.",
    offline:
      "The connection or result couldn’t be confirmed. Reconnect and check the original order.",
    generic: "That didn’t work. Check your connection or call the restaurant.",
    limits: "Up to 30 lines, 1–20 per line and 100 items in total; notes up to 200 characters.",
    amount: "The amount is beyond the supported range. Please call the restaurant.",
    unavailable: "Some dishes are sold out or unavailable. Remove or replace them before sending.",
    options:
      "Some choices (size, toppings…) have changed or sold out. Remove those dishes and add them again.",
    storage:
      "Your browser can’t save the order safely. Allow storage for this tab and reopen the page; you can still browse and edit.",
    damaged:
      "The saved cart couldn’t be read safely. If you had already sent an order, call the restaurant first.",
    orderTitle: "Order status",
    orderNumber: (number) => `No. ${number}`,
    pickupFor: (name) => `Pickup · ${name}`,
    deliveryFor: (name) => `Delivery · ${name}`,
    feePending: "Delivery fee to be confirmed",
    deliveryFee: "Delivery fee",
    numberLabel: "Order",
    submittedAt: (time) => `Sent at ${time}`,
    accepted: "Order accepted",
    pickupAround: "Estimated pickup: come as soon as you can",
    deliveryAround: "Estimated delivery",
    items: "Dishes",
    cancelled: "Cancelled",
    notCharged: "Not charged",
    remark: "Note",
    refresh: "Refresh",
    updating: "This page updates by itself.",
    backToMenu: "Back to the menu",
    ended: "This order has ended, or the link isn’t valid.",
    orderError: "The order status couldn’t be loaded. Check your connection and try again.",
    orderStale: "Update failed: the status may be out of date.",
    waitingHint: (time) => `The restaurant answers by ${time}.`,
    cannotCancel: "To change or cancel the order, call the restaurant.",
    status: {
      waiting: "Sent, waiting for the restaurant",
      expired:
        "The restaurant didn’t confirm in time, so the order isn’t valid. Call the restaurant or order again.",
      rejectedSoldOut: "The restaurant can’t take the order: some dishes are sold out.",
      rejectedBusy: "The restaurant can’t take the order: it’s too busy right now.",
      rejectedClosing: "The restaurant can’t take the order: it’s about to close.",
      rejectedOutOfRange:
        "The restaurant can’t take the order: the address is outside its delivery area.",
      rejectedNoReason: "The restaurant can’t take the order right now.",
      preparingPickup: "Accepted: come at the estimated time",
      preparingDelivery: "Accepted and being prepared",
      readyPickup: "Ready to collect",
      readyDelivery: "Ready and about to leave",
      allCancelled: "Every dish in this order was cancelled. Please contact the restaurant.",
      collectedPickup: "Collected",
      collectedDelivery: "Delivered",
      closed: "Order closed",
    },
    privacyTitle: "Privacy notice",
    privacySections: (restaurant, phone) => [
      {
        heading: "Who handles your data",
        body: `The controller is ${restaurant}${phone ? ` (phone ${phone})` : ""}. TavoloFlow provides the restaurant’s ordering software and, as processor, handles the data only on the restaurant’s instructions.`,
      },
      {
        heading: "What we collect",
        body: "The name and phone you enter when you order; for a delivery, also the address and doorbell or floor notes.",
      },
      {
        heading: "Purpose and legal basis",
        body: "Only to handle your order: confirm it, prepare it and tell you about pickup or delivery. The legal basis is performing the order you place (GDPR Article 6(1)(b)), so no separate consent is needed.",
      },
      {
        heading: "How long",
        body: "Name, phone and address are deleted 30 days after the order is sent; the dishes and amounts stay in the restaurant’s accounts without your contact details.",
      },
      {
        heading: "Your rights",
        body: "You can ask to access, correct or delete your data, or to restrict or object to its use, by contacting the restaurant directly. You can also complain to the Italian data protection authority (Garante per la protezione dei dati personali).",
      },
      {
        heading: "Browser storage",
        body: "This page uses only technically necessary storage: the cart, your language, the order status link and the anti-forgery cookie. No analytics, advertising or third-party tracking.",
      },
    ],
  },
};

// Plain-text notices the cart can show.
export type OnlineOrderMessage =
  | "unknown"
  | "changed"
  | "busy"
  | "paused"
  | "closed"
  | "notOffered"
  | "deliveryOff"
  | "suspended"
  | "linkGone"
  | "invalid"
  | "csrf"
  | "rateLimited"
  | "couponInvalid"
  | "notFound"
  | "offline"
  | "generic"
  | "limits"
  | "amount"
  | "unavailable"
  | "options"
  | "storage"
  | "damaged";

// The server writes errors in English for developers; customers see the translated code.
export const onlineOrderError = (code: string): OnlineOrderMessage =>
  (
    ({
      MENU_CHANGED: "changed",
      ONLINE_BUSY: "busy",
      ONLINE_PAUSED: "paused",
      ONLINE_CLOSED: "closed",
      ONLINE_NOT_OFFERED: "notOffered",
      DELIVERY_NOT_OFFERED: "deliveryOff",
      SERVICE_SUSPENDED: "suspended",
      ONLINE_LINK_NOT_FOUND: "linkGone",
      VALIDATION_FAILED: "invalid",
      CSRF_VALIDATION_FAILED: "csrf",
      RATE_LIMITED: "rateLimited",
      ONLINE_REQUEST_NOT_FOUND: "notFound",
      COUPON_INVALID: "couponInvalid",
    }) as Record<string, OnlineOrderMessage>
  )[code] ?? "generic";
