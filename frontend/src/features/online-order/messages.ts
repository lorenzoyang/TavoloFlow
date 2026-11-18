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
  browserPending: "这个浏览器已有订单等待餐厅接单。购物车已保留，请先查看已有订单。",
  ipWaitingLimit: "这个网络下已有较多订单等待接单，这一单尚未提交。请稍后再试。",
  browserRequired: "浏览器未能保存下单 Cookie。请允许本站 Cookie 后刷新页面。",
  contextChecking: "正在检查待接单订单…",
  contextFailed: "暂时无法检查待接单订单，请重试后再结账。",
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
  phoneForeignHint: "外国号码请加国家码，如 +86。",
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
  feeConfirmed: "餐厅按实际路程确认配送费，接单后显示在订单页。",
  feeTitle: "配送费（按路程）",
  tierLine: (distance: string) => `${distance} 内`,
  free: "免费",
  beyondTiers: (distance: string) => `超过 ${distance} 不配送。`,
  lookupFee: "计算配送费",
  quoteHint: "点「计算配送费」按路程算出配送费；地址会发给地图服务 Geoapify，只用来计算路程。",
  quotedTo: (town: string, fee: string) => `配送到 ${town} · 配送费 ${fee}`,
  quotedFee: (fee: string) => `配送费 ${fee}`,
  quoteTownHint: "城市不对时，请在地址里加上城市名或邮编再计算。",
  outOfRange: "这个地址超出配送范围，不能选择配送。可以致电餐厅，或改为到店自取。",
  quoteUnknown: "没能自动算出配送费，请检查地址拼写。仍然可以下单，配送费按价目表由餐厅确认。",
  attribution: { geoapify: "Powered by Geoapify", osm: "© OpenStreetMap contributors" },
  itemsTotal: "菜品合计",
  minOrderLine: (amount: string) => `配送起送 ${amount}（按扣掉优惠后的菜品金额）`,
  minOrderShort: (minimum: string, missing: string) => `配送起送 ${minimum}，还差 ${missing}`,
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
  privacyLineQuote: (restaurant: string) =>
    `你的姓名、电话和地址交给 ${restaurant} 处理这一单，30 天后删除；计算配送费时，地址还会发给地图服务 Geoapify。`,
  unknown: "订单结果待确认。在查到原来的结果之前，购物车已锁定，不会重复下单。",
  lookup: "查询订单结果",
  retryOriginal: "重试原来的订单",
  // Submission problems; each notice also offers the restaurant's phone
  changed: "菜单有变化，请检查最新的价格和供应情况，再提交。",
  closed: "现在不在线上接单时间内，订单没有提交。",
  linkGone: "这个线上点单链接已失效，订单没有提交。",
  invalid: "请检查姓名、电话、地址和菜品数量。",
  deliveryOff: "餐厅现在不提供配送，可以改为到店自取。",
  minOrder: "菜品金额没到配送起送金额，订单没有提交。可以加菜，或改为到店自取。",
  quoteChanged: "配送费已失效或有变化，订单没有提交。请重新计算配送费再提交。",
  csrf: "页面验证已过期，请再提交一次。",
  rateLimited: "提交次数太多，请稍后再试。",
  verificationRequired: "请完成安全验证后再提交；查询原订单不需要验证。",
  verificationReady: "安全验证已完成。",
  verificationFailed: "安全验证已失效或未通过，请重新验证。",
  verificationUnavailable:
    "安全验证暂时不可用。购物车已保留，请重试或致电餐厅；已提交的订单仍可查询。",
  verificationRetry: "重新验证",
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
  progressLabel: "订单进度",
  progress: {
    sent: "已提交",
    accepted: "已接单",
    readyPickup: "可取餐",
    readyDelivery: "已做好",
    collectedPickup: "已取餐",
    collectedDelivery: "已送达",
  },
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
      body: "姓名、电话和地址在提交满 30 天后，于该餐厅收到下一笔线上订单时删除；备份中的副本最多再保留 7 天。订单的菜品和金额作为餐厅的账目保留，不再与你的联系方式关联。",
    },
    {
      heading: "你的权利",
      body: "你可以要求查看、更正或删除你的数据，或限制、反对处理。请直接联系餐厅。你也可以向意大利个人数据保护机构（Garante per la protezione dei dati personali）投诉。",
    },
    {
      heading: "浏览器存储",
      body: "本页只使用技术上必需的存储：购物车、语言选择、订单状态链接、防伪验证 Cookie 和防止重复占位的浏览器 Cookie（30 天）。服务器还保存按餐厅区分的浏览器及 IP 来源摘要，用于限制待接单占位：餐厅接单或拒单时即清除，未处理而过期的随超过 30 天的联系信息清除。没有统计或广告。",
    },
    {
      heading: "安全验证",
      body: "若启用了安全验证，结账时浏览器会直接连接 Cloudflare Turnstile，用于防止自动刷单。Cloudflare 因此会处理你的 IP 地址以及浏览器和设备的技术信息（如 User-Agent），处理可能发生在欧盟或欧洲经济区以外，适用 Cloudflare 的 Turnstile 隐私说明。我们自己只发送验证凭证及餐厅与请求的绑定摘要，不发送姓名、电话、地址或菜品内容。",
    },
    {
      heading: "地图服务",
      body: "餐厅启用自动配送费时，你点「计算配送费」后，填写的配送地址会发给 Geoapify（欧盟的地图服务，请求只在欧盟处理），只用来算出从餐厅出发的路程；不发送姓名、电话或菜品。Geoapify 的请求记录通常最多保留 24 小时；遇到可疑或欺诈活动等特殊情况，个别请求的细节最多保留 2 个月。订单里保存路程和配送费，不保存查到的位置；地址按上面的规则删除。送餐时，餐厅员工可能在 Google 地图中打开你的地址，查看位置和路线，这时 Google 会收到这个地址，处理可能发生在欧盟以外，适用 Google 的隐私政策。",
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
    browserPending:
      "Questo browser ha già un ordine in attesa. Il carrello è conservato: controlla l’ordine precedente.",
    ipWaitingLimit:
      "Troppi ordini da questa rete sono in attesa. Questo ordine non è stato inviato: riprova tra poco.",
    browserRequired:
      "Il browser non ha salvato il cookie per ordinare. Consenti i cookie di questo sito e ricarica la pagina.",
    contextChecking: "Controllo degli ordini in attesa…",
    contextFailed:
      "Impossibile controllare gli ordini in attesa. Riprova prima di andare alla cassa.",
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
    phoneForeignHint: "Numero estero? Aggiungi il prefisso, es. +44.",
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
      "Il ristorante conferma il costo in base alla distanza su strada: lo vedrai nella pagina dell’ordine dopo l’accettazione.",
    feeTitle: "Costo di consegna (per distanza su strada)",
    tierLine: (distance) => `Entro ${distance}`,
    free: "gratis",
    beyondTiers: (distance) => `Oltre ${distance} non consegniamo.`,
    lookupFee: "Calcola la consegna",
    quoteHint:
      "Tocca «Calcola la consegna» per il costo in base alla distanza su strada: l’indirizzo va al servizio di mappe Geoapify solo per calcolarla.",
    quotedTo: (town, fee) => `Consegna a ${town} · costo ${fee}`,
    quotedFee: (fee) => `Costo di consegna ${fee}`,
    quoteTownHint: "Se il comune non è giusto, aggiungi comune o CAP all’indirizzo e ricalcola.",
    outOfRange:
      "Questo indirizzo è fuori dalla zona di consegna. Puoi chiamare il ristorante o scegliere il ritiro.",
    quoteUnknown:
      "Non riusciamo a calcolare il costo da soli: controlla l’indirizzo. Puoi ordinare lo stesso; il ristorante conferma il costo secondo le tariffe.",
    attribution: { geoapify: "Powered by Geoapify", osm: "© OpenStreetMap contributors" },
    itemsTotal: "Totale piatti",
    minOrderLine: (amount) => `Minimo per la consegna: ${amount} di piatti, al netto dello sconto.`,
    minOrderShort: (minimum, missing) => `Minimo ${minimum} per la consegna: mancano ${missing}`,
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
    privacyLineQuote: (restaurant) =>
      `Nome, telefono e indirizzo vanno a ${restaurant} per questo ordine e si cancellano dopo 30 giorni; per calcolare la consegna, l’indirizzo va anche al servizio di mappe Geoapify.`,
    unknown:
      "L’esito dell’ordine va verificato. Il carrello resta bloccato finché non si conosce l’esito dell’invio originale, così non parte un doppione.",
    lookup: "Verifica l’esito",
    retryOriginal: "Riprova lo stesso ordine",
    changed: "Il menu è cambiato: controlla prezzi e disponibilità aggiornati, poi invia di nuovo.",
    closed: "Ora siamo fuori dall’orario degli ordini online: l’ordine non è stato inviato.",
    linkGone: "Questo link per ordinare online non vale più: l’ordine non è stato inviato.",
    invalid: "Controlla nome, telefono, indirizzo e quantità.",
    deliveryOff: "Ora il ristorante non fa consegne: puoi scegliere il ritiro.",
    minOrder:
      "I piatti non arrivano al minimo per la consegna: l’ordine non è stato inviato. Aggiungi qualcosa o scegli il ritiro.",
    quoteChanged:
      "Il costo di consegna è scaduto o cambiato: l’ordine non è stato inviato. Ricalcolalo e invia di nuovo.",
    csrf: "La verifica della pagina è scaduta: invia di nuovo.",
    rateLimited: "Troppi invii: riprova tra poco.",
    verificationRequired:
      "Completa la verifica prima di inviare. Per controllare l’ordine precedente non serve.",
    verificationReady: "Verifica completata.",
    verificationFailed: "Verifica scaduta o non riuscita. Ripetila prima di inviare.",
    verificationUnavailable:
      "Verifica non disponibile. Il carrello è conservato: riprova o chiama il ristorante. Puoi ancora controllare un ordine già inviato.",
    verificationRetry: "Ripeti verifica",
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
    progressLabel: "Avanzamento dell’ordine",
    progress: {
      sent: "Inviato",
      accepted: "Accettato",
      readyPickup: "Pronto",
      readyDelivery: "Pronto",
      collectedPickup: "Ritirato",
      collectedDelivery: "Consegnato",
    },
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
        body: "Nome, telefono e indirizzo si cancellano con il primo nuovo ordine online ricevuto dal ristorante dopo 30 giorni dall’invio; le copie di backup restano al massimo altri 7 giorni. Piatti e importi dell’ordine restano nella contabilità del ristorante, senza i tuoi contatti.",
      },
      {
        heading: "I tuoi diritti",
        body: "Puoi chiedere di accedere ai tuoi dati, correggerli o cancellarli, oppure limitarne o opporti al trattamento, contattando direttamente il ristorante. Puoi anche presentare reclamo al Garante per la protezione dei dati personali.",
      },
      {
        heading: "Memoria del browser",
        body: "Questa pagina usa solo la memoria tecnicamente necessaria: carrello, lingua scelta, link allo stato dell’ordine, cookie anti-falsificazione e cookie del browser per limitare gli ordini in attesa (30 giorni). Il server conserva impronte del browser e dell’IP separate per ristorante per limitare gli ordini in attesa: si cancellano quando il ristorante accetta o rifiuta l’ordine, altrimenti insieme ai contatti più vecchi di 30 giorni. Nessuna statistica o pubblicità.",
      },
      {
        heading: "Verifica di sicurezza",
        body: "Se la verifica di sicurezza è attiva, alla cassa il browser si collega direttamente a Cloudflare Turnstile per bloccare gli invii automatici. Cloudflare tratta quindi il tuo indirizzo IP e informazioni tecniche sul browser e sul dispositivo (come lo user agent), eventualmente anche fuori dall’UE o dallo SEE, secondo l’informativa privacy di Cloudflare per Turnstile. Noi inviamo solo la prova e un’impronta del ristorante e della richiesta, senza nome, telefono, indirizzo o piatti.",
      },
      {
        heading: "Servizi di mappe",
        body: "Se il ristorante calcola il costo di consegna in automatico, quando tocchi «Calcola la consegna» l’indirizzo che hai inserito viene inviato a Geoapify (servizio di mappe dell’UE, che tratta la richiesta nell’UE) solo per calcolare la distanza su strada dal ristorante; nome, telefono e piatti non vengono inviati. Di norma Geoapify conserva i registri delle richieste al massimo 24 ore; in casi eccezionali, come attività sospette o fraudolente, può conservare i dettagli di singole richieste fino a 2 mesi. L’ordine conserva la distanza e il costo, non il punto trovato; l’indirizzo viene cancellato come indicato sopra. Per la consegna, il personale del ristorante può aprire il tuo indirizzo in Google Maps per vedere posizione e percorso: Google riceve così l’indirizzo, eventualmente anche fuori dall’UE, secondo l’informativa privacy di Google.",
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
    browserPending:
      "This browser already has an order awaiting acceptance. Your cart is saved: check the existing order first.",
    ipWaitingLimit:
      "Too many orders from this network are awaiting acceptance. This order was not submitted: try again shortly.",
    browserRequired:
      "The browser could not save the ordering cookie. Allow this site’s cookies and reload the page.",
    contextChecking: "Checking for orders awaiting acceptance…",
    contextFailed: "Could not check for orders awaiting acceptance. Retry before checking out.",
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
    phoneForeignHint: "Foreign number? Add the country code, e.g. +44.",
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
      "The restaurant confirms the fee from the road distance; you’ll see it on the order page once accepted.",
    feeTitle: "Delivery fee (by road distance)",
    tierLine: (distance) => `Within ${distance}`,
    free: "free",
    beyondTiers: (distance) => `No delivery beyond ${distance}.`,
    lookupFee: "Calculate delivery fee",
    quoteHint:
      "Tap «Calculate delivery fee» to get the fee from the road distance; the address goes to the Geoapify map service only to work it out.",
    quotedTo: (town, fee) => `Delivery to ${town} · fee ${fee}`,
    quotedFee: (fee) => `Delivery fee ${fee}`,
    quoteTownHint:
      "If the town is wrong, add the town or postcode to the address and calculate again.",
    outOfRange:
      "This address is outside the delivery area. You can call the restaurant or choose pickup.",
    quoteUnknown:
      "We couldn’t calculate the fee automatically; check the address spelling. You can still order: the restaurant confirms the fee from the price list.",
    attribution: { geoapify: "Powered by Geoapify", osm: "© OpenStreetMap contributors" },
    itemsTotal: "Items total",
    minOrderLine: (amount) => `Minimum for delivery: ${amount} of dishes, after any coupon.`,
    minOrderShort: (minimum, missing) => `Delivery minimum ${minimum}: ${missing} to go`,
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
    privacyLineQuote: (restaurant) =>
      `Your name, phone and address go to ${restaurant} for this order and are deleted after 30 days; to calculate the delivery fee, the address also goes to the Geoapify map service.`,
    unknown:
      "The order result needs checking. The cart stays locked until the original result is known, so nothing is sent twice.",
    lookup: "Check the result",
    retryOriginal: "Retry the same order",
    changed: "The menu has changed. Check the latest prices and availability, then send again.",
    closed: "Online ordering is outside its hours right now; the order wasn’t sent.",
    linkGone: "This online ordering link no longer works; the order wasn’t sent.",
    invalid: "Check the name, phone, address and quantities.",
    deliveryOff: "The restaurant isn’t delivering right now; you can choose pickup.",
    minOrder:
      "The dishes don’t reach the minimum for delivery, so the order wasn’t sent. Add something or choose pickup.",
    quoteChanged:
      "The delivery fee expired or changed, so the order wasn’t sent. Calculate it again and resend.",
    csrf: "The page check expired. Please send again.",
    rateLimited: "Too many attempts. Try again shortly.",
    verificationRequired:
      "Complete verification before submitting. Checking your existing order needs no verification.",
    verificationReady: "Verification complete.",
    verificationFailed: "Verification expired or failed. Complete it again before submitting.",
    verificationUnavailable:
      "Verification is unavailable. Your cart is saved: retry or call the restaurant. You can still check an order already submitted.",
    verificationRetry: "Retry verification",
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
    progressLabel: "Order progress",
    progress: {
      sent: "Sent",
      accepted: "Accepted",
      readyPickup: "Ready",
      readyDelivery: "Ready",
      collectedPickup: "Collected",
      collectedDelivery: "Delivered",
    },
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
        body: "Name, phone and address are deleted with the restaurant’s next online order once 30 days have passed since yours was sent; backup copies are kept for at most 7 more days. The dishes and amounts stay in the restaurant’s accounts without your contact details.",
      },
      {
        heading: "Your rights",
        body: "You can ask to access, correct or delete your data, or to restrict or object to its use, by contacting the restaurant directly. You can also complain to the Italian data protection authority (Garante per la protezione dei dati personali).",
      },
      {
        heading: "Browser storage",
        body: "This page uses only technically necessary storage: the cart, your language, the order status link, the anti-forgery cookie and a browser cookie to limit waiting orders (30 days). The server also stores restaurant-specific browser and IP digests to limit waiting orders: they are cleared when the restaurant accepts or rejects the order, otherwise along with contact data older than 30 days. No analytics or advertising.",
      },
      {
        heading: "Security verification",
        body: "When security verification is enabled, your browser connects directly to Cloudflare Turnstile at checkout to block automated orders. Cloudflare therefore processes your IP address and technical browser and device information (such as the user agent), possibly outside the EU/EEA, under Cloudflare’s Turnstile privacy policy. We send only the proof and a restaurant/request binding digest, not names, phones, addresses or dishes.",
      },
      {
        heading: "Map services",
        body: "If the restaurant calculates delivery fees automatically, when you tap «Calculate delivery fee» the delivery address you entered is sent to Geoapify (an EU mapping service that processes the request within the EU) only to work out the road distance from the restaurant; names, phones and dishes are not sent. Geoapify normally keeps request logs for at most 24 hours; in exceptional cases, such as suspicious or fraudulent activity, it may keep details of individual requests for up to 2 months. The order keeps the distance and the fee, not the point found; the address is deleted as described above. To deliver, restaurant staff may open your address in Google Maps to see the location and route: Google then receives the address, possibly outside the EU, under Google’s privacy policy.",
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
  | "minOrder"
  | "quoteChanged"
  | "suspended"
  | "linkGone"
  | "invalid"
  | "csrf"
  | "rateLimited"
  | "verificationRequired"
  | "verificationFailed"
  | "verificationUnavailable"
  | "browserPending"
  | "ipWaitingLimit"
  | "browserRequired"
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
      DELIVERY_MIN_ORDER: "minOrder",
      DELIVERY_QUOTE_INVALID: "quoteChanged",
      SERVICE_SUSPENDED: "suspended",
      ONLINE_LINK_NOT_FOUND: "linkGone",
      VALIDATION_FAILED: "invalid",
      CSRF_VALIDATION_FAILED: "csrf",
      RATE_LIMITED: "rateLimited",
      ONLINE_VERIFICATION_FAILED: "verificationFailed",
      ONLINE_VERIFICATION_UNAVAILABLE: "verificationUnavailable",
      ONLINE_BROWSER_PENDING: "browserPending",
      ONLINE_IP_WAITING_LIMIT: "ipWaitingLimit",
      ONLINE_BROWSER_REQUIRED: "browserRequired",
      ONLINE_REQUEST_NOT_FOUND: "notFound",
      COUPON_INVALID: "couponInvalid",
    }) as Record<string, OnlineOrderMessage>
  )[code] ?? "generic";
