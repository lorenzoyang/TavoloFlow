// A live view may authorize writes only after a successful sync that happened since it last became
// visible and online, and while that sync is younger than maxAge (30 seconds unless a view polls slower).
export function syncIsFresh(
  at: number,
  now: number,
  resumeAfter: number,
  active: boolean,
  failed: boolean,
  maxAge = 30_000,
) {
  return active && !failed && at > 0 && at >= resumeAfter && now - at < maxAge;
}

// Whether to tell the user that a live view is not fresh. A view that has just loaded, resumed or
// switched data is unfresh until its first poll, which usually takes well under a second: writes stay
// blocked, but it is reported only once that outlasts the grace period, so a routine refresh never
// flashes a warning. Offline, paused and failed views are reported at once.
export function syncIsStalled(
  fresh: boolean,
  now: number,
  since: number,
  active: boolean,
  failed: boolean,
  grace = 3_000,
) {
  return !fresh && (!active || failed || now - since >= grace);
}

export type WatermarkBaseline = { latest: number; at: number } | null;

// Arrival chimes compare a restaurant-wide watermark (the newest order, or the newest dish waiting at the
// pass) with the previous poll. A strict timestamp increase chimes; this is not an event log, so late
// commits or clock rollback can add work without advancing it. Serving and closing cannot raise it.
// Only polls under 30 seconds apart may announce: first load, resume and reconnect stay silent.
export function watermarkAdvanced(
  previous: WatermarkBaseline,
  watermark: string | null,
  at: number,
) {
  const latest = watermark ? Date.parse(watermark) : 0;
  const advanced =
    !!previous && at > previous.at && at - previous.at < 30_000 && latest > previous.latest;
  return { baseline: { latest, at }, advanced };
}
