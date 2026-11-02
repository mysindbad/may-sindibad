// Process-wide request spacing for a rate-limited upstream.
//
// routing.openstreetmap.de allows at most 1 request per second for the whole
// service. The per-client limit on /api/navigation/directions (120 / 10 min)
// says nothing about that: fifty travellers each making one request in the
// same second would breach it. Every call to a spaced upstream therefore takes
// a slot here first; when the wait would be unreasonable the caller must fail
// honestly (route unavailable) rather than queue forever.
//
// Scope: one Node process. With several web instances the effective global
// rate is instances x this limit, which is exactly why the public service is a
// development / low-volume default and production should use a provider whose
// limits are contractual (see providers.ts).

export interface Spacer {
  /** Resolves true when the caller may proceed now; false when it should give up. */
  take(): Promise<boolean>;
}

export function createSpacer(options: {
  intervalMs: number;
  maxWaitMs: number;
  maxWaiting: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Spacer {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let nextFree = 0;
  let waiting = 0;

  return {
    async take() {
      if (waiting >= options.maxWaiting) return false;
      const start = Math.max(now(), nextFree);
      const wait = start - now();
      if (wait > options.maxWaitMs) return false;
      nextFree = start + options.intervalMs;
      if (wait <= 0) return true;
      waiting += 1;
      try {
        await sleep(wait);
      } finally {
        waiting -= 1;
      }
      return true;
    },
  };
}

/** Shared by every request in this process that goes to the public community router. */
export const publicRouterSpacer: Spacer = createSpacer({ intervalMs: 1100, maxWaitMs: 3500, maxWaiting: 3 });
