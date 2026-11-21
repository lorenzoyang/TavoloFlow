import { formatTime } from "./format.ts";
import type { Language } from "./language.ts";
import { staffMessages } from "./staff-messages.ts";

// How store pages name a session in every channel: a dine-in visit by its table, an accepted online
// order by its daily number, customer name and estimated time. Kitchen, pass, bill and history share it.
export type SessionChannel = "DINE_IN" | "PICKUP" | "DELIVERY";
export type OnlineTicket = {
  number: number;
  customerName: string | null;
  estimatedAt: string;
  requestedPickupAt?: string | null;
};
export type SessionNaming = {
  channel: SessionChannel;
  tableLabel: string | null;
  online: OnlineTicket | null;
};

// A response names its session: dine-in by a table label, online by its ticket.
export function namesSession(session: SessionNaming) {
  return session.channel === "DINE_IN"
    ? typeof session.tableLabel === "string"
    : (session.channel === "PICKUP" || session.channel === "DELIVERY") &&
        !!session.online &&
        Number.isInteger(session.online.number);
}

// "5 桌", "Ritiro #12", "Delivery #12".
export function sessionTitle(session: SessionNaming, language: Language) {
  const m = staffMessages[language];
  if (session.channel === "DINE_IN" || !session.online) return m.table(session.tableLabel ?? "—");
  return session.channel === "PICKUP"
    ? m.pickup(session.online.number)
    : m.delivery(session.online.number);
}

// The customer name and estimated time shown after an online order's title; null for dine-in. The time
// says it is an estimate, so staff never take it for the time the order came in.
export function sessionDetail(session: SessionNaming, language: Language) {
  if (session.channel === "DINE_IN" || !session.online) return null;
  return {
    name: session.online.customerName,
    time: staffMessages[language].estimated(formatTime(session.online.estimatedAt, language)),
  };
}

// One line for notices, dialog titles and labels: "Ritiro #12 · Marco · Previsto 18:25".
export function sessionText(session: SessionNaming, language: Language) {
  const detail = sessionDetail(session, language);
  return [sessionTitle(session, language), detail?.name, detail?.time].filter(Boolean).join(" · ");
}
