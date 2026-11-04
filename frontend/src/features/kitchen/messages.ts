import type { Language } from "@/lib/language";
import type { KitchenView, OrderStatus } from "./state";

type Outcome = "reached" | "changed" | "legacy-reviewed" | "missing" | "confirm-again";

const zh = {
  title: "厨房",
  description: "逐项标记出餐，等待最久的在前。",
  refresh: "刷新订单",
  status: { NEW: "待处理", PROCESSED: "已处理" } as Record<OrderStatus, string>,
  view: { DISHES: "按菜品", NEW: "按订单", PROCESSED: "已处理" } as Record<KitchenView, string>,
  item: { NEW: "待出餐", READY: "已出餐", CANCELLED: "已取消" },
  orderedAt: (time: string) => `${time} 下单`,
  itemsWaiting: (waiting: number, total: number) => `待出餐 ${waiting} 项／共 ${total} 项`,
  waited: (minutes: number) => `已等待 ${minutes} 分钟`,
  allCancelled: "全部已取消",
  processed: "已处理",
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
  viewTabs: "厨房视图",
  listSummary: (status: string, total: number | string, shown: number) =>
    `${status}共 ${total} 笔 · 已显示 ${shown} 笔。仅显示正在用餐的订单。`,
  loading: "正在读取订单…",
  empty: { NEW: "暂无待处理订单。", PROCESSED: "暂无已处理订单。" } as Record<OrderStatus, string>,
  dishSummary: (dishes: number, portions: number) =>
    `待出餐 ${dishes} 道菜，共 ${portions} 份。仅显示正在用餐的订单。`,
  dishesIncomplete: "还有较新的订单未加载，以上数量可能不完整。",
  emptyDishes: "暂无待出餐菜品。",
  categories: "本屏分类",
  categoriesTitle: "本屏显示的分类",
  categoriesHint:
    "取消勾选不在这块屏上做的分类。以后新加的分类、已从菜单删除的菜都会照常显示。只影响「按菜品」和新菜提示音，设置只保存在这台设备上。",
  keepOne: "至少保留一个分类。",
  showAll: "全部显示",
  finish: "完成",
  hiddenCategories: (count: number) =>
    `本屏已隐藏 ${count} 个分类；「按订单」和「已处理」仍显示全部。`,
  categoriesLoading: "正在读取分类…",
  categoriesError: "无法读取菜单分类，本屏暂时显示全部菜品。",
  noCategories: "菜单还没有分类。",
  screenArrivals: (added: number) => `本屏有 ${added} 道新菜。`,
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
  arrivals: (pending: number) => `收到新订单；当前待处理 ${pending} 笔。`,
  done: (label: string, kind: "ready" | "cancel") =>
    `${label}：${kind === "ready" ? "菜品已出餐。" : "菜品已取消，账单金额已更新。"}`,
  writeUnknown: "操作结果待确认。请核对原订单，系统不会自动重新提交。",
};

export const kitchenMessages: Record<Language, typeof zh> = {
  zh,
  it: {
    title: "Cucina",
    description: "Segna i piatti pronti uno alla volta; chi aspetta da più tempo è in alto.",
    refresh: "Aggiorna ordini",
    status: { NEW: "Da fare", PROCESSED: "Evasi" },
    view: { DISHES: "Piatti", NEW: "Ordini", PROCESSED: "Evasi" },
    item: { NEW: "Da fare", READY: "Pronto", CANCELLED: "Annullato" },
    orderedAt: (time) => `Ordine delle ${time}`,
    itemsWaiting: (waiting, total) => `Da fare ${waiting} di ${total}`,
    waited: (minutes) => `${minutes} min`,
    allCancelled: "Tutto annullato",
    processed: "Evaso",
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
    viewTabs: "Vista della cucina",
    listSummary: (status, total, shown) =>
      `${status}: ${total} ordini, ${shown} visualizzati. Solo visite in corso.`,
    loading: "Caricamento ordini…",
    empty: { NEW: "Nessun ordine da fare.", PROCESSED: "Nessun ordine evaso." },
    dishSummary: (dishes, portions) =>
      `Da fare: ${dishes === 1 ? "1 piatto" : `${dishes} piatti`}, ${portions === 1 ? "1 porzione" : `${portions} porzioni`}. Solo visite in corso.`,
    dishesIncomplete:
      "Ci sono ordini più recenti non ancora caricati: i totali potrebbero essere incompleti.",
    emptyDishes: "Nessun piatto da fare.",
    categories: "Categorie",
    categoriesTitle: "Categorie di questo schermo",
    categoriesHint:
      "Togli la spunta a ciò che non si prepara qui. Le nuove categorie e i piatti tolti dal menu compaiono comunque. Vale per la vista Piatti e per l’avviso sonoro, solo su questo dispositivo.",
    keepOne: "Lascia almeno una categoria.",
    showAll: "Mostra tutte",
    finish: "Fatto",
    hiddenCategories: (count) =>
      `${count === 1 ? "1 categoria nascosta" : `${count} categorie nascoste`} qui; Ordini ed Evasi mostrano tutto.`,
    categoriesLoading: "Caricamento categorie…",
    categoriesError: "Impossibile leggere le categorie: per ora lo schermo mostra tutti i piatti.",
    noCategories: "Il menu non ha ancora categorie.",
    screenArrivals: (added) =>
      `${added === 1 ? "1 nuovo piatto" : `${added} nuovi piatti`} per questo schermo.`,
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
    arrivals: (pending) => `Nuovi ordini; da fare: ${pending}.`,
    done: (label, kind) =>
      `${label}: ${kind === "ready" ? "piatto pronto." : "piatto annullato, conto aggiornato."}`,
    writeUnknown:
      "Esito da verificare: controlla l’ordine originale. Nulla verrà reinviato automaticamente.",
  },
  en: {
    title: "Kitchen",
    description: "Mark dishes ready one at a time; the longest wait is at the top.",
    refresh: "Refresh orders",
    status: { NEW: "To do", PROCESSED: "Done" },
    view: { DISHES: "Dishes", NEW: "Orders", PROCESSED: "Done" },
    item: { NEW: "To do", READY: "Ready", CANCELLED: "Cancelled" },
    orderedAt: (time) => `Ordered at ${time}`,
    itemsWaiting: (waiting, total) => `To do ${waiting} of ${total}`,
    waited: (minutes) => `${minutes} min`,
    allCancelled: "All cancelled",
    processed: "Done",
    readyAt: (time) => `Ready: ${time}`,
    cancelledAt: (time) => `Cancelled: ${time} · not charged`,
    ready: "Ready",
    moreActions: (name) => `More actions: ${name}`,
    cancelItem: "Cancel dish",
    amounts: (total, payable) => `Original total: ${total} · Due: ${payable}`,
    processedAt: (time) => `Done: ${time}`,
    pendingTotal: (count) => `Orders to do: ${count}`,
    syncing: "Updating orders.",
    maybeStale: "Orders may be out of date.",
    writesPaused: "Changes paused until the next successful update.",
    readError: "Can’t update the orders. Check the connection and refresh.",
    storageWarning:
      "The browser can’t save action notices. Check pending results here and note the order number before reloading.",
    pendingSection: "Actions to check",
    verify: "Check the dish",
    pendingAction: (kind, order, item) =>
      `Result to check: ${kind === "ready" ? "ready" : "cancellation"} · order #${order}${item ? ` · dish #${item}` : " · old whole-order action"}`,
    viewTabs: "Kitchen view",
    listSummary: (status, total, shown) =>
      `${status}: ${total} orders, ${shown} shown. Open visits only.`,
    loading: "Loading orders…",
    empty: { NEW: "No orders to do.", PROCESSED: "No orders done." },
    dishSummary: (dishes, portions) =>
      `To do: ${dishes === 1 ? "1 dish" : `${dishes} dishes`}, ${portions === 1 ? "1 portion" : `${portions} portions`}. Open visits only.`,
    dishesIncomplete: "Newer orders aren’t loaded yet: the totals may be incomplete.",
    emptyDishes: "No dishes to do.",
    categories: "Categories",
    categoriesTitle: "Categories on this screen",
    categoriesHint:
      "Untick what isn’t prepared here. New categories and dishes removed from the menu still show. Applies to the Dishes view and the alert sound, on this device only.",
    keepOne: "Keep at least one category.",
    showAll: "Show all",
    finish: "Done",
    hiddenCategories: (count) =>
      `${count === 1 ? "1 category hidden" : `${count} categories hidden`} here; Orders and Done show everything.`,
    categoriesLoading: "Loading categories…",
    categoriesError: "Can’t read the categories: for now this screen shows every dish.",
    noCategories: "The menu has no categories yet.",
    screenArrivals: (added) =>
      `${added === 1 ? "1 new dish" : `${added} new dishes`} for this screen.`,
    loadMore: "Load more orders",
    cancelTitle: (table) => `Cancel dish · ${table}`,
    cancelHint: (dish, amount) =>
      `If you cancel «${dish}», ${amount} leaves the bill. First check with the kitchen that it won’t be made.`,
    confirmCancel: "Cancel dish",
    changed: (status) => `The dish is now «${status}»: this confirmation no longer applies.`,
    unknownStatus: "unknown",
    recovered: (table, outcome) =>
      `${table}: ${
        {
          reached: "status checked, the action went through.",
          changed: "the dish was already handled, check its current status.",
          "legacy-reviewed": "old whole-order action checked, check each dish.",
          missing: "the original dish is no longer available, ask the owner to check.",
          "confirm-again": "the dish is still to do; if needed, check again and confirm.",
        }[outcome]
      }`,
    recoveryClosed:
      "The order’s visit is closed or no longer available: ask the owner to check. The action won’t be resent.",
    recoveryUnknown: "Result still to check: check the order when the connection is back.",
    arrivals: (pending) => `New orders; to do: ${pending}.`,
    done: (label, kind) =>
      `${label}: ${kind === "ready" ? "dish ready." : "dish cancelled, bill updated."}`,
    writeUnknown: "Result to check: check the original order. Nothing is resent automatically.",
  },
};
