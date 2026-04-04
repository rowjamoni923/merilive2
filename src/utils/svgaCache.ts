/**
 * Global SVGA VideoItem Cache
 * 
 * Shared across SVGAPlayer and SVGAPlayerWithAudio.
 * Uses window.__svgaCache so both components share one cache.
 * Includes automatic memory management (max 30 items, LRU eviction).
 */

const MAX_CACHE_SIZE = 30;

interface CacheEntry {
  item: any;
  lastUsed: number;
}

const getGlobalCache = (): Map<string, CacheEntry> => {
  if (typeof window !== 'undefined' && (window as any).__svgaCache) {
    return (window as any).__svgaCache;
  }
  const cache = new Map<string, CacheEntry>();
  if (typeof window !== 'undefined') {
    (window as any).__svgaCache = cache;
  }
  return cache;
};

const cache = getGlobalCache();

export const svgaCacheGet = (key: string): any | null => {
  const entry = cache.get(key);
  if (entry) {
    entry.lastUsed = Date.now();
    return entry.item;
  }
  return null;
};

export const svgaCacheSet = (key: string, item: any): void => {
  // Evict oldest if at capacity
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
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
  cache.set(key, { item, lastUsed: Date.now() });
};

export const svgaCacheHas = (key: string): boolean => cache.has(key);

export const svgaCacheClear = (): void => {
  cache.clear();
};
