/**
 * Phase 4C — Persistent gift-icon cache (IndexedDB).
 *
 * Gift panel icons are small (≤10 KB WebP/PNG) but there are 100+ of them.
 * Hitting the CDN on every panel-open causes the broken-tile flicker users
 * see today.  We persist each icon as a Blob keyed by its full URL, so the
 * SECOND open of the panel paints from local storage with zero network.
 *
 * Read-only safe: never blocks render — on any error the consumer just
 * falls back to the raw CDN URL via `<img src>`.
 */
const DB_NAME = 'lovable-gift-icons';
const STORE = 'icons';
const DB_VERSION = 1;
const MAX_BYTES = 24 * 1024 * 1024; // soft cap; LRU eviction below

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'url' });
          os.createIndex('lastUsed', 'lastUsed');
          os.createIndex('size', 'size');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

interface IconRecord {
  url: string;
  blob: Blob;
  size: number;
  lastUsed: number;
}

const objectUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

async function readFromIDB(url: string): Promise<Blob | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise<Blob | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      const getReq = os.get(url);
      getReq.onsuccess = () => {
        const rec = getReq.result as IconRecord | undefined;
        if (!rec) { resolve(null); return; }
        try {
          rec.lastUsed = Date.now();
          os.put(rec);
        } catch {}
        resolve(rec.blob);
      };
      getReq.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeToIDB(url: string, blob: Blob): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      os.put({ url, blob, size: blob.size, lastUsed: Date.now() } as IconRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

let evictionQueued = false;
async function maybeEvict(): Promise<void> {
  if (evictionQueued) return;
  evictionQueued = true;
  const run = async () => {
    try {
      const db = await openDB();
      if (!db) return;
      const all: IconRecord[] = await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE, 'readonly');
          const os = tx.objectStore(STORE);
          const req = os.getAll();
          req.onsuccess = () => resolve((req.result as IconRecord[]) || []);
          req.onerror = () => resolve([]);
        } catch { resolve([]); }
      });
      const total = all.reduce((s, r) => s + (r.size || 0), 0);
      if (total <= MAX_BYTES) return;
      const sorted = all.slice().sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
      let remaining = total;
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      for (const rec of sorted) {
        if (remaining <= MAX_BYTES * 0.8) break;
        try { os.delete(rec.url); remaining -= rec.size || 0; } catch {}
      }
    } finally {
      evictionQueued = false;
    }
  };
  if (typeof (window as any)?.requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(() => { void run(); }, { timeout: 4000 });
  } else {
    setTimeout(() => { void run(); }, 4000);
  }
}

/**
 * Returns an object-URL backed by IDB cache when available, otherwise the
 * original URL.  Network fetch is fired in the background; subsequent calls
 * for the same URL return the cached blob URL synchronously via objectUrlCache.
 *
 * Safe to call concurrently — in-flight de-dupes.
 */
export function getCachedIconUrlSync(url: string): string | null {
  return objectUrlCache.get(url) || null;
}

export async function ensureCachedIconUrl(url: string): Promise<string> {
  if (!url) return url;
  const cached = objectUrlCache.get(url);
  if (cached) return cached;
  const existing = inflight.get(url);
  if (existing) return existing;
  const p = (async () => {
    try {
      // Skip caching for data:/blob: URLs and obvious non-static formats
      if (/^(data:|blob:)/i.test(url)) return url;
      const lower = url.split('?')[0].toLowerCase();
      if (lower.endsWith('.svga') || lower.endsWith('.json')
          || lower.endsWith('.mp4') || lower.endsWith('.webm')) return url;

      // Try IDB first
      const fromIdb = await readFromIDB(url);
      if (fromIdb) {
        const objUrl = URL.createObjectURL(fromIdb);
        objectUrlCache.set(url, objUrl);
        return objUrl;
      }

      // Network fetch + persist
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
      if (!res.ok) return url;
      const blob = await res.blob();
      // Sanity guard — icons should be tiny.  Skip caching huge files.
      if (blob.size > 512 * 1024) return url;
      await writeToIDB(url, blob);
      void maybeEvict();
      const objUrl = URL.createObjectURL(blob);
      objectUrlCache.set(url, objUrl);
      return objUrl;
    } catch {
      return url;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

/** Batch prefetch — fire-and-forget. */
export function prefetchGiftIcons(urls: Array<string | null | undefined>): void {
  for (const u of urls) {
    if (!u) continue;
    void ensureCachedIconUrl(u).catch(() => {});
  }
}
