// A live view may authorize writes only after a successful sync that happened since it last became
// visible and online, and while that sync is less than 30 seconds old.
export function syncIsFresh(
  at: number,
  now: number,
  resumeAfter: number,
  active: boolean,
  failed: boolean,
) {
  return active && !failed && at > 0 && at >= resumeAfter && now - at < 30_000;
}
