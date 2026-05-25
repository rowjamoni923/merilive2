/**
 * Lottie JSON in-memory cache (Pkg C).
 *
 * UniversalAnimationPlayer used to re-fetch + re-parse the Lottie JSON every
 * time a gift played. For a 600 KB JSON that's a 50-200 ms hit per play.
 * This cache keeps parsed JSON in memory so subsequent plays are instant,
 * with an LRU cap so memory stays bounded.
 *
 * Mirrors the API style of svgaCache.ts.
 */

const MAX_ENTRIES = 50;

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

/**
 * Cache-aware fetch. Returns parsed JSON or throws.
 * De-duplicates concurrent requests for the same URL.
 */
export async function fetchLottieCached(url: string, signal?: AbortSignal): Promise<any> {
  const hit = lottieCacheGet(url);
  if (hit) return hit;

  const existing = inflight.get(url);
  if (existing) return existing;

  const p = (async () => {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Lottie fetch failed: ${res.status}`);
      const data = await res.json();
      lottieCacheSet(url, data);
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
}
