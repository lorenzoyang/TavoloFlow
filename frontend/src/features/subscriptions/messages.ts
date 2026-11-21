import type { Language } from "@/lib/language";
import type { SubscriptionSummary } from "./state";

type ServiceState = SubscriptionSummary["serviceState"];

// The OWNER page, its reminder and the platform pages all follow the device language.
const zh = {
  state: {
    UNCONFIGURED: "暂未开始收费",
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
  dueSoon: "续费期限将在 7 天内到。",
  awaitingPayment: "续费待付款。",
  expired: "已到续费日期，请安排续费。",
  range: (startsOn: string, endsOn: string) => `${startsOn} 至 ${endsOn}（截止当天到期）`,
  amount: (months: number, fee: string, amount: string) =>
    `${fee}/月 × ${months} 个月 · 共 ${amount}`,
  paidOn: (date: string | null) => (date ? `付费日期 ${date}` : "付费日期尚未登记"),
  paid: "已付费",
  unpaidBadge: "未付费",
  // The OWNER page.
  title: "收费与续费",
  refresh: "刷新资料",
  loading: "正在读取收费资料…",
  defaultFee: "下次新建周期的默认月费",
  notSet: "尚未设置",
  contact: "登记的老板联系方式",
  notRegistered: "尚未登记",
  collectedOffline: "费用由平台管理员线下收取，收到全款后更新付费日期。服务期限按约定日期计算。",
  stale: "资料待刷新，当前显示的是上次读取结果。",
  periods: "收费周期与付款历史",
  noPeriods: "尚未登记收费周期。",
  ownerOnly: "仅老板可以查看收费与续费。",
};

export const subscriptionMessages: Record<Language, typeof zh> = {
  zh,
  it: {
    state: {
      UNCONFIGURED: "Non ancora a pagamento",
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
    dueSoon: "Il rinnovo è previsto entro 7 giorni.",
    awaitingPayment: "Rinnovo da pagare.",
    expired: "È il momento di rinnovare l’abbonamento.",
    range: (startsOn, endsOn) => `Dal ${startsOn} al ${endsOn} (escluso)`,
    amount: (months, fee, amount) =>
      `${fee}/mese × ${months} ${months === 1 ? "mese" : "mesi"} · totale ${amount}`,
    paidOn: (date) => (date ? `Pagato il ${date}` : "Pagamento non ancora registrato"),
    paid: "Pagato",
    unpaidBadge: "Da pagare",
    title: "Abbonamento",
    refresh: "Aggiorna",
    loading: "Caricamento dell’abbonamento…",
    defaultFee: "Canone mensile per i nuovi periodi",
    notSet: "Non impostato",
    contact: "Contatto del titolare",
    notRegistered: "Non registrato",
    collectedOffline:
      "Il canone è riscosso dall’amministratore della piattaforma fuori dall’app; la data di pagamento si aggiorna a saldo ricevuto. Il servizio segue le date concordate.",
    stale: "Dati da aggiornare: questa è l’ultima lettura riuscita.",
    periods: "Periodi e pagamenti",
    noPeriods: "Nessun periodo registrato.",
    ownerOnly: "Solo il titolare può vedere l’abbonamento.",
  },
  en: {
    state: {
      UNCONFIGURED: "Billing hasn’t started",
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
    dueSoon: "Renewal is due within 7 days.",
    awaitingPayment: "Renewal awaiting payment.",
    expired: "Renewal is overdue.",
    range: (startsOn, endsOn) => `${startsOn} to ${endsOn} (exclusive)`,
    amount: (months, fee, amount) =>
      `${fee}/month × ${months} ${months === 1 ? "month" : "months"} · total ${amount}`,
    paidOn: (date) => (date ? `Paid on ${date}` : "Payment not recorded yet"),
    paid: "Paid",
    unpaidBadge: "Unpaid",
    title: "Subscription",
    refresh: "Refresh",
    loading: "Loading the subscription…",
    defaultFee: "Monthly fee for new periods",
    notSet: "Not set",
    contact: "Owner contact",
    notRegistered: "Not registered",
    collectedOffline:
      "The fee is collected by the platform administrator outside the app; the payment date is updated once paid in full. The service follows the agreed dates.",
    stale: "Data to refresh: this is the last successful read.",
    periods: "Periods and payments",
    noPeriods: "No periods registered.",
    ownerOnly: "Only the owner can see the subscription.",
  },
};

// The platform's own subscription management: periods, payments, fees and reminders.
const platformZh = {
  reminderError: "收费提醒暂时无法更新。",
  remindersTitle: "收费待办",
  reminder: (kind: "UNPAID" | "DUE_SOON" | "EXPIRED", count: number) =>
    `${kind === "UNPAID" ? "待收款" : kind === "DUE_SOON" ? "7 天内到期" : "已到期"} ${count} 家`,
  remindersStale: "提醒待刷新，以上为上次读取结果。",
  unknownResult:
    "操作结果未知，请核对刷新后的资料。修改只按确认时的版本生效，重新确认不会重复登记。",
  done: "操作已完成。",
  monthlyInvalid: "请填写有效月费，最多两位小数。",
  periodInvalid: "请检查起始日期、月数和月费。已收款时还须填写实收日期。",
  checkInput: "请核对输入。",
  notSet: "未设置",
  metadataConfirm: (fee: string) =>
    `保存联系方式及下次新建周期的默认月费：${fee}。已有周期约定保持原值。`,
  periodConfirm: (
    create: boolean,
    startsOn: string,
    endsOn: string,
    months: number,
    amount: string,
    paidOn: string | null,
  ) =>
    `${create ? "登记" : "修改"} ${startsOn} 至 ${endsOn}，${months} 个月，整个周期总金额 ${amount}。${paidOn ? `已收全款，付费日期 ${paidOn}。` : "未付费。"}`,
  paidOnInvalid: "请填写不晚于今天的实际付费日期。",
  paymentConfirm: (startsOn: string, endsOn: string, amount: string, paidOn: string) =>
    `确认实收 ${amount}，服务期 ${startsOn} 至 ${endsOn}，收款日期 ${paidOn}。确认后本期记录锁定。`,
  title: "收费与续费",
  loading: "正在读取收费资料…",
  ownerContact: "老板联系方式",
  notRegistered: "尚未登记",
  defaultFee: "下次新建周期的默认月费",
  feeNotSet: "尚未设置",
  editMetadata: "编辑月费与联系方式",
  stale: "当前资料待刷新；读取成功后可继续修改。",
  editor: {
    metadata: "联系方式与默认月费",
    edit: "修改未付款周期",
    payment: "登记收到全款",
  },
  monthlyField: "下次新建周期的默认月费（EUR，可留空）",
  paidOn: "实际付费日期",
  checkContinue: "核对并继续",
  cancelEdit: "取消编辑",
  editorStale: "资料已被更新，请关闭编辑后重新核对最新资料。",
  confirmTitle: "确认本次操作",
  versionChanged: "资料版本已变化，请取消后重新读取。",
  confirm: "确认执行",
  backToEdit: "返回修改",
  periodsTitle: "收费周期与付款历史",
  noPeriods: "尚未登记收费周期。",
  confirmPaid: "确认收到全款",
  editAgreement: "修改约定",
  startBilling: "开始收费",
  renew: "登记续费",
  monthlyFee: "月费（EUR）",
  reasonOptional: "给老板的说明（可选）",
  reasonRequired: "修改原因（老板可见）",
  startsOn: "开始收费日期",
  months: "月数",
  endsOn: "截止日期（当天到期）",
  amount: "整个周期总金额（EUR）",
  paidFull: "已收到整个周期的全款",
};

export const platformSubscriptionMessages: Record<Language, typeof platformZh> = {
  zh: platformZh,
  it: {
    reminderError: "Impossibile aggiornare gli avvisi sugli abbonamenti.",
    remindersTitle: "Abbonamenti da seguire",
    reminder: (kind, count) =>
      `${kind === "UNPAID" ? "Da pagare" : kind === "DUE_SOON" ? "In scadenza entro 7 giorni" : "Scaduti"}: ${count}`,
    remindersStale: "Avvisi da aggiornare: questa è l’ultima lettura riuscita.",
    unknownResult:
      "Esito sconosciuto: controlla i dati aggiornati. Ogni modifica vale solo per la versione confermata, quindi confermare di nuovo non la registra due volte.",
    done: "Operazione completata.",
    monthlyInvalid: "Inserisci un canone valido, con al massimo due decimali.",
    periodInvalid:
      "Controlla la data di inizio, i mesi e il canone mensile. Se hai ricevuto il saldo, indica anche la data del pagamento.",
    checkInput: "Controlla i dati inseriti.",
    notSet: "non impostato",
    metadataConfirm: (fee) =>
      `Salvare il contatto e il canone mensile per i nuovi periodi: ${fee}. I periodi già concordati non cambiano.`,
    periodConfirm: (create, startsOn, endsOn, months, amount, paidOn) =>
      `${create ? "Registrare" : "Modificare"} il periodo dal ${startsOn} al ${endsOn}, ${months} ${months === 1 ? "mese" : "mesi"}, totale ${amount}. ${paidOn ? `Pagato per intero il ${paidOn}.` : "Da pagare."}`,
    paidOnInvalid: "Inserisci la data effettiva del pagamento, non successiva a oggi.",
    paymentConfirm: (startsOn, endsOn, amount, paidOn) =>
      `Confermare di aver ricevuto per intero ${amount} per il periodo dal ${startsOn} al ${endsOn}, pagato il ${paidOn}. Dopo la conferma il periodo sarà bloccato.`,
    title: "Abbonamento e rinnovi",
    loading: "Caricamento dell’abbonamento…",
    ownerContact: "Contatto del titolare",
    notRegistered: "Non registrato",
    defaultFee: "Canone mensile per i nuovi periodi",
    feeNotSet: "Non impostato",
    editMetadata: "Modifica contatto e canone",
    stale: "Dati da aggiornare: potrai modificarli dopo una lettura riuscita.",
    editor: {
      metadata: "Contatto e canone predefinito",
      edit: "Modifica periodo non pagato",
      payment: "Registra pagamento completo",
    },
    monthlyField: "Canone mensile per i nuovi periodi (EUR, facoltativo)",
    paidOn: "Data effettiva del pagamento",
    checkContinue: "Controlla e continua",
    cancelEdit: "Annulla modifica",
    editorStale: "I dati sono stati aggiornati: chiudi la modifica e controlla quelli nuovi.",
    confirmTitle: "Conferma l’operazione",
    versionChanged: "La versione dei dati è cambiata: annulla e ricarica.",
    confirm: "Conferma",
    backToEdit: "Torna alla modifica",
    periodsTitle: "Periodi e pagamenti",
    noPeriods: "Nessun periodo registrato.",
    confirmPaid: "Registra pagamento",
    editAgreement: "Modifica accordo",
    startBilling: "Inizia ad addebitare",
    renew: "Registra rinnovo",
    monthlyFee: "Canone mensile (EUR)",
    reasonOptional: "Nota per il titolare (facoltativa)",
    reasonRequired: "Motivo della modifica (visibile al titolare)",
    startsOn: "Data di inizio",
    months: "Mesi",
    endsOn: "Data di fine (esclusa)",
    amount: "Importo totale del periodo (EUR)",
    paidFull: "Pagamento ricevuto per l’intero periodo",
  },
  en: {
    reminderError: "Can’t update the subscription reminders.",
    remindersTitle: "Subscriptions to follow up",
    reminder: (kind, count) =>
      `${kind === "UNPAID" ? "Unpaid" : kind === "DUE_SOON" ? "Ending within 7 days" : "Expired"}: ${count}`,
    remindersStale: "Reminders to refresh: this is the last successful read.",
    unknownResult:
      "Unknown result: check the refreshed data. Each change applies only to the version you confirmed, so confirming again never records it twice.",
    done: "Done.",
    monthlyInvalid: "Enter a valid fee with at most two decimals.",
    periodInvalid:
      "Check the start date, months and monthly fee. If paid, also enter the actual payment date.",
    checkInput: "Check the data you entered.",
    notSet: "not set",
    metadataConfirm: (fee) =>
      `Save the contact and the monthly fee for new periods: ${fee}. Periods already agreed don’t change.`,
    periodConfirm: (create, startsOn, endsOn, months, amount, paidOn) =>
      `${create ? "Register" : "Change"} the period ${startsOn} to ${endsOn}, ${months} ${months === 1 ? "month" : "months"}, total ${amount}. ${paidOn ? `Paid in full on ${paidOn}.` : "Unpaid."}`,
    paidOnInvalid: "Enter the actual payment date, no later than today.",
    paymentConfirm: (startsOn, endsOn, amount, paidOn) =>
      `Confirm the full ${amount} for ${startsOn} to ${endsOn} was received, paid on ${paidOn}. Confirming locks this period.`,
    title: "Billing and renewals",
    loading: "Loading the subscription…",
    ownerContact: "Owner contact",
    notRegistered: "Not registered",
    defaultFee: "Monthly fee for new periods",
    feeNotSet: "Not set",
    editMetadata: "Edit contact and fee",
    stale: "Data to refresh: you can edit again after a successful read.",
    editor: {
      metadata: "Contact and default fee",
      edit: "Edit unpaid period",
      payment: "Record full payment",
    },
    monthlyField: "Monthly fee for new periods (EUR, optional)",
    paidOn: "Actual payment date",
    checkContinue: "Check and continue",
    cancelEdit: "Cancel editing",
    editorStale: "The data was updated: close the editor and check the new data.",
    confirmTitle: "Confirm this action",
    versionChanged: "The data version has changed: cancel and reload.",
    confirm: "Confirm",
    backToEdit: "Back to editing",
    periodsTitle: "Periods and payments",
    noPeriods: "No periods registered.",
    confirmPaid: "Record payment",
    editAgreement: "Edit agreement",
    startBilling: "Start billing",
    renew: "Record renewal",
    monthlyFee: "Monthly fee (EUR)",
    reasonOptional: "Note for the owner (optional)",
    reasonRequired: "Reason for the change (visible to the owner)",
    startsOn: "Start date",
    months: "Months",
    endsOn: "End date (exclusive)",
    amount: "Total amount for the period (EUR)",
    paidFull: "Full payment received for the period",
  },
};

export const noticeMessages = {
  zh: {
    title: "收费提醒",
    kinds: {
      REGISTERED: "已登记收费",
      CHANGED: "收费约定已修改",
      PAID: "已确认收款",
      DUE_SOON: "即将到期",
      EXPIRED: "已到期",
    },
    awaitingPayment: "续费待付款",
    currentPaid: "本期已收款",
    currentUnpaid: "本期待收款",
    previous: "原约定",
    acknowledge: "我知道了",
    refreshing: "正在更新提醒…",
    readError: "暂时无法读取收费提醒。",
    saveError: "暂时无法确认已读。请重试。",
  },
  it: {
    title: "Avvisi sugli abbonamenti",
    kinds: {
      REGISTERED: "Periodo registrato",
      CHANGED: "Accordo aggiornato",
      PAID: "Pagamento registrato",
      DUE_SOON: "In scadenza",
      EXPIRED: "Scaduto",
    },
    awaitingPayment: "Rinnovo da pagare",
    currentPaid: "Periodo pagato",
    currentUnpaid: "Periodo da pagare",
    previous: "Accordo precedente",
    acknowledge: "Ho capito",
    refreshing: "Aggiornamento degli avvisi…",
    readError: "Impossibile leggere gli avvisi.",
    saveError: "Impossibile confermare la lettura. Riprova.",
  },
  en: {
    title: "Subscription reminders",
    kinds: {
      REGISTERED: "Billing period recorded",
      CHANGED: "Agreement updated",
      PAID: "Payment recorded",
      DUE_SOON: "Due soon",
      EXPIRED: "Expired",
    },
    awaitingPayment: "Renewal awaiting payment",
    currentPaid: "Period paid",
    currentUnpaid: "Period unpaid",
    previous: "Previous agreement",
    acknowledge: "Got it",
    refreshing: "Updating reminders…",
    readError: "Can’t load the subscription reminders.",
    saveError: "Can’t mark the reminders as read. Try again.",
  },
};
