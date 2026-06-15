/**
 * Persistent Avatar + Frame Cache
 * ------------------------------------------------------------------
 * Stores each user's last-known avatar URL and frame (url + type) in
 * localStorage so that <AvatarWithFrame /> can render the photo + frame
 * **synchronously on first paint**, even when the device is offline
 * or the network is slow. Eliminates the "letter S placeholder flash"
 * users were seeing on profile pages, chat rows, viewer panels, etc.
 *
 * - In-memory mirror for O(1) sync reads
 * - localStorage flush is throttled (rAF + microtask) so call sites can
 *   write freely without blocking layout
 * - TTL = 30 days; entries older than that are evicted on read
 * - LRU cap = 500 entries to keep storage usage bounded
 *
 * NOTE: image bytes themselves are cached by the browser's HTTP cache;
 * what we cache here is just the URL/type metadata so the <img> tag can
 * be emitted on the very first render instead of waiting for a network
 * round-trip to /profiles_public + /avatar_frames.
 */

const STORAGE_KEY = 'mlive:avatar-cache:v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ENTRIES = 500;

export interface PersistedAvatar {
  /** Real (non-placeholder) avatar URL */
  avatarUrl?: string | null;
  /** Resolved frame URL (avatar_frames / shop_items / role_frames) */
  frameUrl?: string | null;
  /** Frame type: static | svga | lottie | gif | webp */
  frameType?: string | null;
  /** Last write timestamp */
  ts: number;
}

const memCache = new Map<string, PersistedAvatar>();
let hydrated = false;
let flushScheduled = false;

const safeWindow = (): Window | null =>
  typeof window !== 'undefined' ? window : null;

const hydrate = () => {
  if (hydrated) return;
  hydrated = true;
  const w = safeWindow();
  if (!w) return;
  try {
    const raw = w.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, PersistedAvatar>;
    const now = Date.now();
    for (const [id, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.ts !== 'number') continue;
      if (now - entry.ts > TTL_MS) continue;
      memCache.set(id, entry);
    }
  } catch {
    // corrupted; clear so we start fresh
    try { safeWindow()?.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
};

const scheduleFlush = () => {
  if (flushScheduled) return;
  flushScheduled = true;
  const w = safeWindow();
  if (!w) { flushScheduled = false; return; }
  const run = () => {
    flushScheduled = false;
    try {
      // LRU cap — keep the freshest MAX_ENTRIES
      if (memCache.size > MAX_ENTRIES) {
        const entries = Array.from(memCache.entries())
          .sort((a, b) => b[1].ts - a[1].ts)
          .slice(0, MAX_ENTRIES);
        memCache.clear();
        for (const [k, v] of entries) memCache.set(k, v);
      }
      const obj: Record<string, PersistedAvatar> = {};
      memCache.forEach((v, k) => { obj[k] = v; });
      w.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // quota exceeded — drop half and retry once silently
      try {
        const entries = Array.from(memCache.entries())
          .sort((a, b) => b[1].ts - a[1].ts)
          .slice(0, Math.floor(MAX_ENTRIES / 2));
        memCache.clear();
        for (const [k, v] of entries) memCache.set(k, v);
        const obj: Record<string, PersistedAvatar> = {};
        memCache.forEach((v, k) => { obj[k] = v; });
        w.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
      } catch { /* give up */ }
    }
  };
  // Defer to idle / next frame so UI work isn't blocked
  if (typeof (w as any).requestIdleCallback === 'function') {
    (w as any).requestIdleCallback(run, { timeout: 1500 });
  } else {
    w.setTimeout(run, 250);
  }
};

const merge = (userId: string, patch: Partial<PersistedAvatar>) => {
  if (!userId) return;
  hydrate();
  const prev = memCache.get(userId) || { ts: 0 };
  const next: PersistedAvatar = {
    avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : prev.avatarUrl,
    frameUrl: patch.frameUrl !== undefined ? patch.frameUrl : prev.frameUrl,
    frameType: patch.frameType !== undefined ? patch.frameType : prev.frameType,
    ts: Date.now(),
  };
  memCache.set(userId, next);
  scheduleFlush();
};

/** Synchronous read — safe to call inside useState initializer. */
export const getPersistedAvatar = (userId?: string | null): PersistedAvatar | null => {
  if (!userId) return null;
  hydrate();
  const entry = memCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    memCache.delete(userId);
    scheduleFlush();
    return null;
  }
  return entry;
};

export const persistAvatarUrl = (userId?: string | null, url?: string | null) => {
  if (!userId || !url) return;
  if (!/^https?:\/\//i.test(url)) return; // skip placeholders / data URIs
  const existing = getPersistedAvatar(userId);
  if (existing?.avatarUrl === url) {
    // refresh ts to keep entry hot in LRU
    merge(userId, {});
    return;
  }
  merge(userId, { avatarUrl: url });
};

export const persistFrame = (
  userId?: string | null,
  frameUrl?: string | null,
  frameType?: string | null,
) => {
  if (!userId) return;
  const existing = getPersistedAvatar(userId);
  // Always persist — null frameUrl is meaningful (means "user has no frame")
  if (
    existing?.frameUrl === (frameUrl ?? null) &&
    existing?.frameType === (frameType ?? null)
  ) {
    merge(userId, {});
    return;
  }
  merge(userId, {
    frameUrl: frameUrl ?? null,
    frameType: frameType ?? null,
  });
};

export const clearPersistedAvatar = (userId?: string | null) => {
  if (!userId) return;
  hydrate();
  if (memCache.delete(userId)) scheduleFlush();
};

export const clearAllPersistedAvatars = () => {
  memCache.clear();
  try { safeWindow()?.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
};
