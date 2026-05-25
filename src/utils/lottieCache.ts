/**
 * Lottie JSON cache (Pkg C pass-1 + pass-2).
 *
 * Two-tier:
 *   Tier 1 — in-memory LRU (50 entries). Instant on repeat play in same session.
 *   Tier 2 — Browser Cache API ('lottie-binary-v1'). Survives full reload.
 *
 * UniversalAnimationPlayer used to re-fetch + re-parse the Lottie JSON every
 * time a gift played. For a 600 KB JSON that's a 50-200 ms hit per play.
 *
 * Mirrors svgaCache.ts (memory) + svgaPrewarm.ts (Cache API) split.
 */

const MAX_ENTRIES = 50;
const CACHE_NAME = 'lottie-json-v1';

interface Entry {
  data: any;
  lastUsed: number;
}

const getGlobal = (): Map<string, Entry> => {
  if (typeof window !== 'undefined' && (window as any).__lottieCache) {
    return (window as any).__lottieCache;
  }
  const m = new Map<string, Entry>();
  if (typeof window !== 'undefined') (window as any).__lottieCache = m;
  return m;
};

const cache = getGlobal();
const inflight = new Map<string, Promise<any>>();

function evictIfNeeded(key: string) {
  if (cache.size < MAX_ENTRIES || cache.has(key)) return;
  let oldestKey = '';
  let oldestTime = Infinity;
  cache.forEach((v, k) => {
    if (v.lastUsed < oldestTime) {
      oldestTime = v.lastUsed;
      oldestKey = k;
    }
  });
  if (oldestKey) cache.delete(oldestKey);
}

export function lottieCacheGet(url: string): any | null {
  const e = cache.get(url);
  if (!e) return null;
  e.lastUsed = Date.now();
  return e.data;
}

export function lottieCacheSet(url: string, data: any): void {
  evictIfNeeded(url);
  cache.set(url, { data, lastUsed: Date.now() });
}

// ---- Cache API (cross-session) ----

let cacheInstance: Cache | null = null;
async function getPersistentCache(): Promise<Cache | null> {
  if (cacheInstance) return cacheInstance;
  try {
    if (typeof caches === 'undefined') return null;
    cacheInstance = await caches.open(CACHE_NAME);
    return cacheInstance;
  } catch {
    return null;
  }
}

/**
 * Cache-aware fetch. Returns parsed JSON or throws.
 * Resolution order:
 *   1. in-memory cache (instant)
 *   2. in-flight dedupe (concurrent calls share one promise)
 *   3. persistent Cache API (parse + populate memory)
 *   4. network fetch (parse + populate both layers)
 */
export async function fetchLottieCached(url: string, signal?: AbortSignal): Promise<any> {
  const hit = lottieCacheGet(url);
  if (hit) return hit;

  const existing = inflight.get(url);
  if (existing) return existing;

  const p = (async () => {
    try {
      // Tier 2: persistent Cache API
      const pcache = await getPersistentCache();
      if (pcache) {
        try {
          const cached = await pcache.match(url);
          if (cached) {
            const data = await cached.json();
            lottieCacheSet(url, data);
            return data;
          }
        } catch {
          // fall through to network
        }
      }

      // Tier 3: network
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Lottie fetch failed: ${res.status}`);
      const cloneForCache = res.clone();
      const data = await res.json();
      lottieCacheSet(url, data);
      if (pcache) {
        // best-effort persist
        pcache.put(url, cloneForCache).catch(() => {});
      }
      return data;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

export function lottieCacheClear(): void {
  cache.clear();
  inflight.clear();
  // best-effort persistent purge
  if (typeof caches !== 'undefined') {
    caches.delete(CACHE_NAME).catch(() => {});
  }
}
