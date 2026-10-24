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
