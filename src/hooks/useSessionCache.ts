/**
 * Ultra-fast session-local cache for pages using useState/useEffect patterns.
 * Stores data in sessionStorage for instant restore on tab switches.
 * Works alongside real-time subscriptions that update data in background.
 */

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getSessionCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`meri_sc_${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      sessionStorage.removeItem(`meri_sc_${key}`);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

export function setSessionCache<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(`meri_sc_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // Storage full — ignore
  }
}
