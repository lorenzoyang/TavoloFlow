import type { PassItem } from "./api.ts";

export type PassTable = { sessionId: string; tableLabel: string; items: PassItem[] };
export type ReadyBaseline = { latest: number; at: number } | null;

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

// Any newly ready dish is newer than every waiting one, so it raises the watermark even if an older dish
// was served in between; serving and closing only lower it. Like the kitchen's arrival count, only polls
// under 30 seconds apart may announce: first load, resume and reconnect establish a silent baseline.
export function readyArrived(previous: ReadyBaseline, latestReadyAt: string | null, at: number) {
  const latest = latestReadyAt ? Date.parse(latestReadyAt) : 0;
  const arrived =
    !!previous && at > previous.at && at - previous.at < 30_000 && latest > previous.latest;
  return { baseline: { latest, at }, arrived };
}

// How long a dish has waited at the pass. A display choice only: nothing is blocked or reordered.
export function passWaitLevel(minutes: number): "normal" | "late" {
  return minutes >= 5 ? "late" : "normal";
}
