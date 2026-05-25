/**
 * 🗂️ Generic Query Cache (Pkg D pass-3)
 *
 * Shared in-memory cache + in-flight Promise dedupe for arbitrary
 * idempotent reads. Modeled after `appSettingsCache` but loader-agnostic.
 *
 * Use cases:
 *   - `currency_rates` (active list) — read on Agency/Withdrawal/Helper pages
 *   - `user_level_tiers` (host/user) — called from levelResolver across feeds
 *   - any other table whose contents change infrequently and is read by
 *     many components on a single navigation.
 *
 * Features:
 *   - Per-key Map cache with configurable TTL (default 60s)
 *   - Per-key in-flight Promise dedupe (concurrent callers share one fetch)
 *   - Cross-table invalidation via `admin-table-update` window event
 *     (callers register the table names that should bust a key)
 *   - Imperative `invalidateQuery(key?)`
 *
 * Not a replacement for React Query — this is a thin module-level cache
 * for ad-hoc fetches that don't need component-level loading state.
 */

const DEFAULT_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const tableSubscribers = new Map<string, Set<string>>(); // table -> keys
let listenerAttached = false;

function ensureListener() {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  window.addEventListener('admin-table-update', (event: Event) => {
    const detail = (event as CustomEvent<{ table?: string }>).detail;
    const table = detail?.table;
    if (!table) return;
    const keys = tableSubscribers.get(table);
    if (!keys || keys.size === 0) return;
    for (const key of keys) {
      cache.delete(key);
      inflight.delete(key);
    }
  });
}

export interface QueryCacheOptions {
  /** Cache freshness window in ms. Default 60_000. Pass 0 to force network. */
  maxAgeMs?: number;
  /**
   * Bust this key whenever the agent broadcasts an `admin-table-update`
   * event for any of these table names.
   */
  invalidateOnTables?: readonly string[];
}

/**
 * Get a cached value by `key`, fetching via `loader` on miss.
 * Concurrent callers for the same key share a single `loader` invocation.
 *
 * Loader is expected to be idempotent (no side effects, same input → same output).
 * Errors are NOT cached — the next caller retries.
 */
export async function getCachedQuery<T>(
  key: string,
  loader: () => Promise<T>,
  opts: QueryCacheOptions = {},
): Promise<T> {
  ensureListener();

  if (opts.invalidateOnTables?.length) {
    for (const table of opts.invalidateOnTables) {
      let bucket = tableSubscribers.get(table);
      if (!bucket) {
        bucket = new Set();
        tableSubscribers.set(table, bucket);
      }
      bucket.add(key);
    }
  }

  const maxAge = typeof opts.maxAgeMs === 'number' ? opts.maxAgeMs : DEFAULT_TTL_MS;
  const cached = cache.get(key);
  if (cached && maxAge > 0 && Date.now() - cached.fetchedAt < maxAge) {
    return cached.value as T;
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      const value = await loader();
      cache.set(key, { value, fetchedAt: Date.now() });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise as Promise<T>;
}

/** Bust one key (or the whole cache when called with no args). */
export function invalidateQuery(key?: string) {
  if (key) {
    cache.delete(key);
    inflight.delete(key);
  } else {
    cache.clear();
    inflight.clear();
  }
}
