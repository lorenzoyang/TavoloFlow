// Tracks a page's in-flight requests, so a late answer can tell whether it still applies.
//
// A page may run one request per key at a time (an order, a visit, or a fixed key such as "floor"
// for a page that writes one thing at a time). A lifecycle change (going offline, leaving the
// foreground, another identity, unmount) cancels them all: their results must then be ignored,
// because the page may already show other data or another account.
export type Operation = {
  // The request's abort signal. Writes whose result may be lost still wrap it in withTimeout().
  signal: AbortSignal;
  // False once the request was aborted or the page invalidated or cancelled its work.
  isCurrent(): boolean;
  // Unregisters the operation. True only while it was still registered, i.e. not cancelled: only
  // then may the caller clear the busy state it set, which a cancellation already reset.
  finish(): boolean;
};

export type Operations = ReturnType<typeof createOperations>;

export function createOperations() {
  let generation = 0;
  const running = new Map<string, AbortController>();
  return {
    // Null while the same key is already running.
    start(key: string): Operation | null {
      if (running.has(key)) return null;
      const controller = new AbortController();
      running.set(key, controller);
      const started = generation;
      return {
        signal: controller.signal,
        isCurrent: () => started === generation && !controller.signal.aborted,
        finish() {
          // An operation cancelled and replaced under the same key must not unregister the new one.
          if (running.get(key) !== controller) return false;
          running.delete(key);
          return true;
        },
      };
    },
    has: (key: string) => running.has(key),
    running: () => running.size > 0,
    // Later results are ignored, but the requests keep going and stay registered. The guest page uses
    // it to discard a join code it is about to hide without aborting a join in flight.
    invalidate() {
      generation++;
    },
    // Ignores every later result and aborts every request.
    cancelAll() {
      generation++;
      for (const controller of running.values()) controller.abort();
      running.clear();
    },
  };
}
