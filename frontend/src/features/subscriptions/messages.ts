import type { StaffLanguage } from "@/lib/staff-language";
import type { SubscriptionSummary } from "./state";

type ServiceState = SubscriptionSummary["serviceState"];

// The OWNER page and its reminder follow the staff language; platform pages pass "zh".
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

export const subscriptionMessages: Record<StaffLanguage, typeof zh> = {
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
};
