import type { PassItem } from "./api.ts";

export type PassTable = { sessionId: string; tableLabel: string; items: PassItem[] };

// One card per visit. Dishes arrive oldest-ready first, so the table waiting longest comes first and
// each card keeps its dishes in ready order.
export function groupByTable(items: readonly PassItem[]): PassTable[] {
  const tables = new Map<string, PassTable>();
  for (const item of items) {
    const table = tables.get(item.sessionId) ?? {
      sessionId: item.sessionId,
      tableLabel: item.tableLabel,
      items: [],
    };
    table.items.push(item);
    tables.set(item.sessionId, table);
  }
  return [...tables.values()];
}

// How long a dish has waited at the pass. A display choice only: nothing is blocked or reordered.
export function passWaitLevel(minutes: number): "normal" | "late" {
  return minutes >= 5 ? "late" : "normal";
}
