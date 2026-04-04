/**
 * Admin Data Cache — In-memory + localStorage stale-while-revalidate cache
 * Eliminates loading spinners on admin pages by showing cached data instantly
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  key: string;
}

const MEMORY_CACHE = new Map<string, CacheEntry>();
const STORAGE_PREFIX = 'adm_cache_';
const DEFAULT_STALE_MS = 5 * 60 * 1000; // 5 minutes stale tolerance
const MAX_STORAGE_ENTRIES = 30;

/** Get cached data (memory first, then localStorage) */
export function getAdminCache<T>(key: string): T | null {
  // 1. Memory cache (fastest)
  const memEntry = MEMORY_CACHE.get(key);
  if (memEntry) return memEntry.data as T;

  // 2. localStorage fallback
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry<T>;
      // Restore to memory
      MEMORY_CACHE.set(key, entry);
      return entry.data;
    }
  } catch {}

  return null;
}

/** Store data in both memory and localStorage — skips empty/zero data to prevent stale 0s */
export function setAdminCache<T>(key: string, data: T): void {
  // Don't cache empty arrays — they represent failed/incomplete fetches
  if (Array.isArray(data) && data.length === 0) return;
  // Don't cache null/undefined
  if (data === null || data === undefined) return;

  const entry: CacheEntry<T> = { data, timestamp: Date.now(), key };
  
  // Memory cache (always)
  MEMORY_CACHE.set(key, entry);

  // localStorage (best effort, with size management)
  try {
    // Cleanup old entries if too many
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
    if (allKeys.length > MAX_STORAGE_ENTRIES) {
      // Remove oldest entries
      const entries = allKeys.map(k => {
        try {
          const e = JSON.parse(localStorage.getItem(k) || '{}');
          return { key: k, ts: e.timestamp || 0 };
        } catch { return { key: k, ts: 0 }; }
      }).sort((a, b) => a.ts - b.ts);
      
      entries.slice(0, 10).forEach(e => localStorage.removeItem(e.key));
    }

    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {}
}

/** Check if cache is still fresh */
export function isCacheFresh(key: string, maxAgeMs: number = DEFAULT_STALE_MS): boolean {
  const memEntry = MEMORY_CACHE.get(key);
  if (memEntry) return (Date.now() - memEntry.timestamp) < maxAgeMs;
  
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const entry = JSON.parse(raw);
      return (Date.now() - entry.timestamp) < maxAgeMs;
    }
  } catch {}
  
  return false;
}

/** Invalidate specific cache key */
export function invalidateAdminCache(key: string): void {
  MEMORY_CACHE.delete(key);
  try { localStorage.removeItem(STORAGE_PREFIX + key); } catch {}
}

/** Invalidate all admin cache */
export function clearAllAdminCache(): void {
  MEMORY_CACHE.clear();
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}

/**
 * Generate cache key from query params
 */
export function makeCacheKey(page: string, params?: Record<string, any>): string {
  if (!params) return page;
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `${page}:${sorted.map(([k, v]) => `${k}=${v}`).join(',')}`;
}
