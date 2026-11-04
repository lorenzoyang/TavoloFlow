import type { Language } from "@/lib/language";
import type { SubscriptionSummary } from "./state";

type ServiceState = SubscriptionSummary["serviceState"];

// The OWNER page, its reminder and the platform pages all follow the device language.
const zh = {
  state: {
    UNCONFIGURED: "尚未登记",
    UPCOMING: "待开始",
    ACTIVE: "使用中",
    EXPIRED: "已到期",
  } as Record<ServiceState, string>,
  period: (state: ServiceState): string =>
    state === "UPCOMING" ? "待开始周期" : state === "EXPIRED" ? "最近周期" : "当前周期",
  payment: (period: string, paid: boolean) => `${period}${paid ? "已付费" : "未付费"}`,
  dates: (period: string, startsOn: string, expiresOn: string | null) =>
    `${period}开始日期 ${startsOn} · 连续约定服务截止日期 ${expiresOn}（当天到期）`,
  paymentHint: "各周期的付款情况请查看收费周期明细。",
  unpaid: (count: number) => `有 ${count} 个已开始的周期待付费。`,
  dueSoon: "服务将在 7 天内到期，请安排续费。",
  expired: "约定服务期限已到期，请安排续费。",
  range: (startsOn: string, endsOn: string) => `${startsOn} 至 ${endsOn}（截止当天到期）`,
  amount: (years: number, amount: string) => `${years} 年 · 总金额 ${amount}`,
  paidOn: (date: string | null) => (date ? `付费日期 ${date}` : "付费日期尚未登记"),
  paid: "已付费",
  unpaidBadge: "未付费",
  // The OWNER page.
  title: "年费与收费周期",
  refresh: "刷新资料",
  loading: "正在读取年费资料…",
  defaultFee: "下次新建周期的默认年费",
  notSet: "尚未设置",
  contact: "登记的老板联系方式",
  notRegistered: "尚未登记",
  collectedOffline: "费用由平台管理员线下收取，收到全款后更新付费日期。服务期限按约定日期计算。",
  stale: "资料待刷新，当前显示的是上次读取结果。",
  periods: "收费周期与付款历史",
  noPeriods: "尚未登记收费周期。",
  ownerOnly: "仅老板可以查看年费与收费周期。",
  reminderError: "年费提醒暂时无法更新。",
  viewSubscription: "查看年费与收费周期",
  reminderStale: " 提醒待刷新。",
};

export const subscriptionMessages: Record<Language, typeof zh> = {
  zh,
  it: {
    state: {
      UNCONFIGURED: "Non registrato",
      UPCOMING: "Non iniziato",
      ACTIVE: "Attivo",
      EXPIRED: "Scaduto",
    },
    period: (state) =>
      state === "UPCOMING"
        ? "Periodo futuro"
        : state === "EXPIRED"
          ? "Ultimo periodo"
          : "Periodo attuale",
    payment: (period, paid) => `${period}: ${paid ? "pagato" : "da pagare"}`,
    dates: (period, startsOn, expiresOn) =>
      `${period}: inizio ${startsOn} · servizio continuativo fino al ${expiresOn} (escluso)`,
    paymentHint: "Per i pagamenti di ogni periodo vedi l’elenco dei periodi.",
    unpaid: (count) =>
      count === 1 ? "1 periodo iniziato è da pagare." : `${count} periodi iniziati sono da pagare.`,
    dueSoon: "Il servizio scade entro 7 giorni: organizza il rinnovo.",
    expired: "Il servizio concordato è scaduto: organizza il rinnovo.",
    range: (startsOn, endsOn) => `Dal ${startsOn} al ${endsOn} (escluso)`,
    amount: (years, amount) => `${years} ${years === 1 ? "anno" : "anni"} · totale ${amount}`,
    paidOn: (date) => (date ? `Pagato il ${date}` : "Pagamento non ancora registrato"),
    paid: "Pagato",
    unpaidBadge: "Da pagare",
    title: "Abbonamento",
    refresh: "Aggiorna",
    loading: "Caricamento dell’abbonamento…",
    defaultFee: "Canone annuo per i nuovi periodi",
    notSet: "Non impostato",
    contact: "Contatto del titolare",
    notRegistered: "Non registrato",
    collectedOffline:
      "Il canone è riscosso dall’amministratore della piattaforma fuori dall’app; la data di pagamento si aggiorna a saldo ricevuto. Il servizio segue le date concordate.",
    stale: "Dati da aggiornare: questa è l’ultima lettura riuscita.",
    periods: "Periodi e pagamenti",
    noPeriods: "Nessun periodo registrato.",
    ownerOnly: "Solo il titolare può vedere l’abbonamento.",
    reminderError: "Impossibile aggiornare gli avvisi dell’abbonamento.",
    viewSubscription: "Vedi abbonamento",
    reminderStale: " Avvisi da aggiornare.",
  },
  en: {
    state: {
      UNCONFIGURED: "Not registered",
      UPCOMING: "Not started",
      ACTIVE: "Active",
      EXPIRED: "Expired",
    },
    period: (state) =>
      state === "UPCOMING"
        ? "Upcoming period"
        : state === "EXPIRED"
          ? "Latest period"
          : "Current period",
    payment: (period, paid) => `${period}: ${paid ? "paid" : "unpaid"}`,
    dates: (period, startsOn, expiresOn) =>
      `${period}: starts ${startsOn} · continuous service until ${expiresOn} (exclusive)`,
    paymentHint: "For each period’s payment, see the list of periods.",
    unpaid: (count) =>
      count === 1 ? "1 started period is unpaid." : `${count} started periods are unpaid.`,
    dueSoon: "The service ends within 7 days: arrange the renewal.",
    expired: "The agreed service has expired: arrange the renewal.",
    range: (startsOn, endsOn) => `${startsOn} to ${endsOn} (exclusive)`,
    amount: (years, amount) => `${years} ${years === 1 ? "year" : "years"} · total ${amount}`,
    paidOn: (date) => (date ? `Paid on ${date}` : "Payment not recorded yet"),
    paid: "Paid",
    unpaidBadge: "Unpaid",
    title: "Subscription",
    refresh: "Refresh",
    loading: "Loading the subscription…",
    defaultFee: "Annual fee for new periods",
    notSet: "Not set",
    contact: "Owner contact",
    notRegistered: "Not registered",
    collectedOffline:
      "The fee is collected by the platform administrator outside the app; the payment date is updated once paid in full. The service follows the agreed dates.",
    stale: "Data to refresh: this is the last successful read.",
    periods: "Periods and payments",
    noPeriods: "No periods registered.",
    ownerOnly: "Only the owner can see the subscription.",
    reminderError: "Can’t update the subscription reminders.",
    viewSubscription: "See subscription",
    reminderStale: " Reminders to refresh.",
  },
};

// The platform's own subscription management: periods, payments, fees and reminders.
const platformZh = {
  reminderError: "年费提醒暂时无法更新。",
  reminderLoading: "正在读取年费提醒…",
  reminders: (unpaid: number, dueSoon: number, expired: number) =>
    `年费提醒：已开始待收款 ${unpaid} 家 · 7 天内到期 ${dueSoon} 家 · 已到期 ${expired} 家`,
  remindersStale: "提醒待刷新，以上为上次读取结果。",
  unknownResult:
    "操作结果未知，请核对刷新后的资料。修改只按确认时的版本生效，重新确认不会重复登记。",
  done: "操作已完成。",
  annualInvalid: "请填写最多两位小数的有效年费。",
  periodInvalid: "请填写有效的开始日期、年数、截止日期和周期总金额；已付费时还须填写付费日期。",
  checkInput: "请核对输入。",
  notSet: "未设置",
  metadataConfirm: (fee: string) =>
    `保存联系方式及下次新建周期的默认年费：${fee}。已有周期约定保持原值。`,
  periodConfirm: (
    create: boolean,
    startsOn: string,
    endsOn: string,
    years: number,
    amount: string,
    paidOn: string | null,
  ) =>
    `${create ? "登记" : "修改"} ${startsOn} 至 ${endsOn}，${years} 年，整个周期总金额 ${amount}。${paidOn ? `已收全款，付费日期 ${paidOn}。` : "未付费。"}`,
  endAfterStart: "截止日期必须晚于开始日期。",
  expiryConfirm: (from: string, to: string) =>
    `把截止日期从 ${from} 调整到 ${to}。本次只调整期限，不登记收款。`,
  paidOnInvalid: "请填写不晚于今天的实际付费日期。",
  paymentConfirm: (startsOn: string, endsOn: string, amount: string, paidOn: string) =>
    `确认已收到 ${startsOn} 至 ${endsOn} 的全部费用 ${amount}，实际付费日期 ${paidOn}。服务起止日期保持原约定。`,
  region: "餐厅年费管理",
  title: "年费与收费周期",
  refresh: "刷新年费资料",
  loading: "正在读取年费资料…",
  ownerContact: "老板联系方式",
  notRegistered: "尚未登记",
  defaultFee: "下次新建周期的默认年费",
  feeNotSet: "尚未设置",
  newPeriod: "登记新收费周期",
  editMetadata: "编辑联系方式与年费",
  stale: "当前资料待刷新；读取成功后可继续修改。",
  editor: {
    metadata: "联系方式与默认年费",
    create: "登记新收费周期",
    edit: "修改未付款周期",
    expiry: "单独调整截止日期",
    payment: "登记收到全款",
  },
  annualField: "下次新建周期的默认年费（EUR，可留空）",
  newEnd: "新的截止日期",
  paidOn: "实际付费日期",
  checkContinue: "核对并继续",
  cancelEdit: "取消编辑",
  editorStale: "资料已被更新，请关闭编辑后重新核对最新资料。",
  confirmRegion: "收费操作确认",
  confirmTitle: "确认本次操作",
  versionChanged: "资料版本已变化，请取消后重新读取。",
  confirm: "确认执行",
  backToEdit: "返回修改",
  periodsTitle: "收费周期与付款历史",
  noPeriods: "尚未登记收费周期。",
  confirmPaid: "确认收到全款",
  editAgreement: "修改约定",
  adjustExpiry: "单独调整期限",
  // The period form fields.
  startsOn: "开始收费日期",
  years: "收费年数",
  endsOn: "截止日期（当天到期）",
  recomputeEnd: "按开始日期和年数重新计算",
  amount: "整个周期总金额（EUR）",
  recomputeAmount: "按年费 × 年数重新计算",
  paidFull: "已收到整个周期的全款",
};

export const platformSubscriptionMessages: Record<Language, typeof platformZh> = {
  zh: platformZh,
  it: {
    reminderError: "Impossibile aggiornare gli avvisi sugli abbonamenti.",
    reminderLoading: "Caricamento degli avvisi sugli abbonamenti…",
    reminders: (unpaid, dueSoon, expired) =>
      `Abbonamenti: ${unpaid} iniziati da pagare · ${dueSoon} in scadenza entro 7 giorni · ${expired} scaduti`,
    remindersStale: "Avvisi da aggiornare: questa è l’ultima lettura riuscita.",
    unknownResult:
      "Esito sconosciuto: controlla i dati aggiornati. Ogni modifica vale solo per la versione confermata, quindi confermare di nuovo non la registra due volte.",
    done: "Operazione completata.",
    annualInvalid: "Inserisci un canone valido, con al massimo due decimali.",
    periodInvalid:
      "Inserisci data di inizio, anni, data di fine e importo totale validi; se è pagato, anche la data di pagamento.",
    checkInput: "Controlla i dati inseriti.",
    notSet: "non impostato",
    metadataConfirm: (fee) =>
      `Salvare il contatto e il canone annuo per i nuovi periodi: ${fee}. I periodi già concordati non cambiano.`,
    periodConfirm: (create, startsOn, endsOn, years, amount, paidOn) =>
      `${create ? "Registrare" : "Modificare"} il periodo dal ${startsOn} al ${endsOn}, ${years} ${years === 1 ? "anno" : "anni"}, totale ${amount}. ${paidOn ? `Pagato per intero il ${paidOn}.` : "Da pagare."}`,
    endAfterStart: "La data di fine deve essere successiva a quella di inizio.",
    expiryConfirm: (from, to) =>
      `Spostare la data di fine dal ${from} al ${to}. Cambia solo la durata, senza registrare pagamenti.`,
    paidOnInvalid: "Inserisci la data effettiva del pagamento, non successiva a oggi.",
    paymentConfirm: (startsOn, endsOn, amount, paidOn) =>
      `Confermare di aver ricevuto per intero ${amount} per il periodo dal ${startsOn} al ${endsOn}, pagato il ${paidOn}. Le date del servizio restano quelle concordate.`,
    region: "Abbonamento del ristorante",
    title: "Abbonamento e periodi",
    refresh: "Aggiorna i dati dell’abbonamento",
    loading: "Caricamento dell’abbonamento…",
    ownerContact: "Contatto del titolare",
    notRegistered: "Non registrato",
    defaultFee: "Canone annuo per i nuovi periodi",
    feeNotSet: "Non impostato",
    newPeriod: "Nuovo periodo",
    editMetadata: "Modifica contatto e canone",
    stale: "Dati da aggiornare: potrai modificarli dopo una lettura riuscita.",
    editor: {
      metadata: "Contatto e canone predefinito",
      create: "Nuovo periodo",
      edit: "Modifica periodo non pagato",
      expiry: "Modifica solo la data di fine",
      payment: "Registra pagamento completo",
    },
    annualField: "Canone annuo per i nuovi periodi (EUR, facoltativo)",
    newEnd: "Nuova data di fine",
    paidOn: "Data effettiva del pagamento",
    checkContinue: "Controlla e continua",
    cancelEdit: "Annulla modifica",
    editorStale: "I dati sono stati aggiornati: chiudi la modifica e controlla quelli nuovi.",
    confirmRegion: "Conferma dell’operazione sull’abbonamento",
    confirmTitle: "Conferma l’operazione",
    versionChanged: "La versione dei dati è cambiata: annulla e ricarica.",
    confirm: "Conferma",
    backToEdit: "Torna alla modifica",
    periodsTitle: "Periodi e pagamenti",
    noPeriods: "Nessun periodo registrato.",
    confirmPaid: "Registra pagamento",
    editAgreement: "Modifica accordo",
    adjustExpiry: "Modifica data di fine",
    startsOn: "Data di inizio",
    years: "Anni",
    endsOn: "Data di fine (esclusa)",
    recomputeEnd: "Ricalcola da inizio e anni",
    amount: "Importo totale del periodo (EUR)",
    recomputeAmount: "Ricalcola come canone × anni",
    paidFull: "Pagamento ricevuto per l’intero periodo",
  },
  en: {
    reminderError: "Can’t update the subscription reminders.",
    reminderLoading: "Loading subscription reminders…",
    reminders: (unpaid, dueSoon, expired) =>
      `Subscriptions: ${unpaid} started and unpaid · ${dueSoon} ending within 7 days · ${expired} expired`,
    remindersStale: "Reminders to refresh: this is the last successful read.",
    unknownResult:
      "Unknown result: check the refreshed data. Each change applies only to the version you confirmed, so confirming again never records it twice.",
    done: "Done.",
    annualInvalid: "Enter a valid fee with at most two decimals.",
    periodInvalid:
      "Enter a valid start date, years, end date and total amount; if paid, the payment date too.",
    checkInput: "Check the data you entered.",
    notSet: "not set",
    metadataConfirm: (fee) =>
      `Save the contact and the annual fee for new periods: ${fee}. Periods already agreed don’t change.`,
    periodConfirm: (create, startsOn, endsOn, years, amount, paidOn) =>
      `${create ? "Register" : "Change"} the period ${startsOn} to ${endsOn}, ${years} ${years === 1 ? "year" : "years"}, total ${amount}. ${paidOn ? `Paid in full on ${paidOn}.` : "Unpaid."}`,
    endAfterStart: "The end date must be after the start date.",
    expiryConfirm: (from, to) =>
      `Move the end date from ${from} to ${to}. This only changes the term and records no payment.`,
    paidOnInvalid: "Enter the actual payment date, no later than today.",
    paymentConfirm: (startsOn, endsOn, amount, paidOn) =>
      `Confirm the full ${amount} for ${startsOn} to ${endsOn} was received, paid on ${paidOn}. The service dates stay as agreed.`,
    region: "Restaurant subscription",
    title: "Subscription and periods",
    refresh: "Refresh subscription data",
    loading: "Loading the subscription…",
    ownerContact: "Owner contact",
    notRegistered: "Not registered",
    defaultFee: "Annual fee for new periods",
    feeNotSet: "Not set",
    newPeriod: "New period",
    editMetadata: "Edit contact and fee",
    stale: "Data to refresh: you can edit again after a successful read.",
    editor: {
      metadata: "Contact and default fee",
      create: "New period",
      edit: "Edit unpaid period",
      expiry: "Change the end date only",
      payment: "Record full payment",
    },
    annualField: "Annual fee for new periods (EUR, optional)",
    newEnd: "New end date",
    paidOn: "Actual payment date",
    checkContinue: "Check and continue",
    cancelEdit: "Cancel editing",
    editorStale: "The data was updated: close the editor and check the new data.",
    confirmRegion: "Subscription action confirmation",
    confirmTitle: "Confirm this action",
    versionChanged: "The data version has changed: cancel and reload.",
    confirm: "Confirm",
    backToEdit: "Back to editing",
    periodsTitle: "Periods and payments",
    noPeriods: "No periods registered.",
    confirmPaid: "Record payment",
    editAgreement: "Edit agreement",
    adjustExpiry: "Change end date",
    startsOn: "Start date",
    years: "Years",
    endsOn: "End date (exclusive)",
    recomputeEnd: "Recalculate from start and years",
    amount: "Total amount for the period (EUR)",
    recomputeAmount: "Recalculate as fee × years",
    paidFull: "Full payment received for the period",
  },
};
