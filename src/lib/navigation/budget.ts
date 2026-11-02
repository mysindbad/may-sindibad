// Spending and quota protection for the routing provider's free plan
// (Geoapify Free: 3000 credits/day, 5 requests/second, no card on file).
//
// Layers, cheapest first:
//   1. Kill switch (ROUTING_KILL_SWITCH=true): nothing leaves the server.
//   2. Result cache: an identical route asked again within a short window is
//      served from memory and costs nothing.
//   3. Circuit breaker: after the provider says "limit reached" or "key
//      rejected" we stop calling it for a while instead of hammering it.
//   4. Persistent shared budget: a daily credit ceiling (default 400, far under
//      the 3000 plan) and a per-second ceiling (default 3, under the plan's 5),
//      counted in the app's existing shared PostgreSQL rate-limit table so they
//      hold across restarts and across several web instances.
//
// Honest limits of this design (also in the handoff):
//   * It counts THIS app's requests. It cannot see credits spent by anyone else
//     holding the same key (manual tests, a leaked key). A provider-side cap or
//     key restriction is still the real hard stop and is NOT verified here.
//   * It fails CLOSED: if the shared counter cannot be read or written, the
//     request is refused - quota enforcement that cannot be proven is not
//     enforcement.

export type BudgetDecision = "ok" | "daily_exhausted" | "rate_limited" | "unverifiable";

export interface CounterStore {
  /** Count one more event in a fixed window and say whether it is still within `limit`. */
  hit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean }>;
}

export interface BudgetConfig {
  dailyCredits: number;
  perSecond: number;
}

export const DEFAULT_DAILY_CREDITS = 400;
/**
 * The plan allows 5 requests/second. The counter uses fixed one-second windows,
 * and a burst that straddles a window boundary can legitimately use the limit
 * twice within about one second - so the ceiling is HALF the plan rate
 * (2 -> at most 4 in any second, never 6). Configuration can lower it, never
 * raise it above this.
 */
export const DEFAULT_PER_SECOND = 2;
/** Hard ceilings: configuration can lower these but never raise them past the plan. */
const PLAN_DAILY_CREDITS = 3000;
const PLAN_PER_SECOND = Math.floor(5 / 2);

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

export function readBudgetConfig(env: Record<string, string | undefined> = process.env): BudgetConfig {
  return {
    dailyCredits: positiveInt(env.GEOAPIFY_DAILY_BUDGET, DEFAULT_DAILY_CREDITS, PLAN_DAILY_CREDITS),
    perSecond: positiveInt(env.GEOAPIFY_MAX_PER_SECOND, DEFAULT_PER_SECOND, PLAN_PER_SECOND),
  };
}

export function killSwitchOn(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.ROUTING_KILL_SWITCH?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "on";
}

const DAY_MS = 26 * 60 * 60 * 1000; // a per-UTC-date key never needs to outlive its day by more than this

export function utcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export interface Budget {
  /** Reserve one request's credits before calling the provider. */
  reserve(): Promise<BudgetDecision>;
  /** Charge credits discovered only after the answer (long routes cost extra). */
  settleExtra(credits: number): Promise<void>;
}

export function createBudget(store: CounterStore, config: BudgetConfig, now: () => number = Date.now): Budget {
  const dailyKey = () => `geoapify:daily:${utcDayKey(now())}`;
  return {
    async reserve() {
      try {
        const second = await store.hit(`geoapify:sec:${Math.floor(now() / 1000)}`, config.perSecond, 1000);
        if (!second.allowed) return "rate_limited";
        const day = await store.hit(dailyKey(), config.dailyCredits, DAY_MS);
        return day.allowed ? "ok" : "daily_exhausted";
      } catch {
        return "unverifiable";
      }
    },
    async settleExtra(credits) {
      // Best effort: the credits are already spent, this only keeps the count honest.
      for (let i = 0; i < Math.min(credits, 10); i += 1) {
        try {
          await store.hit(dailyKey(), config.dailyCredits, DAY_MS);
        } catch {
          return;
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export type BreakerReason = "auth" | "limit" | "failures";

export interface Breaker {
  /** Non-null while open: why, and until when. */
  status(): { reason: BreakerReason; until: number } | null;
  tripAuth(): void;
  tripLimit(): void;
  recordFailure(): void;
  recordSuccess(): void;
}

export function createBreaker(now: () => number = Date.now): Breaker {
  let open: { reason: BreakerReason; until: number } | null = null;
  let consecutiveFailures = 0;

  const trip = (reason: BreakerReason, ms: number) => {
    open = { reason, until: now() + ms };
  };

  return {
    status() {
      if (open && open.until <= now()) {
        open = null;
        consecutiveFailures = 0;
      }
      return open;
    },
    // A rejected key will not fix itself: wait long, and let the owner act.
    tripAuth: () => trip("auth", 10 * 60 * 1000),
    tripLimit: () => trip("limit", 5 * 60 * 1000),
    recordFailure() {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) trip("failures", 30 * 1000);
    },
    recordSuccess() {
      consecutiveFailures = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Short-lived result cache
// ---------------------------------------------------------------------------

export interface RouteCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  size(): number;
}

export function createRouteCache<T>(options: { ttlMs: number; maxEntries: number; now?: () => number }): RouteCache<T> {
  const now = options.now ?? Date.now;
  const entries = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (entries.size >= options.maxEntries && !entries.has(key)) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { value, expiresAt: now() + options.ttlMs });
    },
    size: () => entries.size,
  };
}

/** The same origin (to ~10 m), destination and mode are the same route for the cache. */
export function routeCacheKey(from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode: string): string {
  const r = (n: number) => n.toFixed(4);
  return `${mode}|${r(from.lat)},${r(from.lng)}|${r(to.lat)},${r(to.lng)}`;
}
