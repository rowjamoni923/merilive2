/**
 * LiveKit Token Cache — Phase 1 of instant-entry architecture.
 *
 * Persists a wildcard VIEWER token (room: "*") in localStorage so repeat
 * entries into any live tile / party browse / preview skip the
 * "fetch token (200-400ms)" step entirely.
 *
 * - TTL: 6h (matches edge function)
 * - Refresh-ahead: 10min before expiry (background, non-blocking)
 * - Survives reloads, restored on boot
 *
 * NOT used for: host publish tokens, private call tokens, party publisher
 * tokens — those stay room-specific (security) and are minted at the
 * relevant setup screen, not at tap.
 */
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lk_viewer_wildcard_token_v1";
const REFRESH_AHEAD_MS = 10 * 60 * 1000; // refresh 10 min before expiry

interface CachedViewerToken {
  token: string;
  url: string;
  identity: string;
  /** unix ms */
  expiresAtMs: number;
  /** unix ms when cached */
  cachedAtMs: number;
}

class LiveKitTokenCache {
  private cached: CachedViewerToken | null = null;
  private inFlight: Promise<CachedViewerToken | null> | null = null;

  constructor() {
    this.restore();
  }

  private restore() {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as CachedViewerToken;
      if (!parsed?.token || !parsed?.expiresAtMs) return;
      // Drop if already expired or about to expire within 1 min
      if (parsed.expiresAtMs - Date.now() < 60_000) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      this.cached = parsed;
    } catch {
      // ignore corrupt cache
    }
  }

  private persist(value: CachedViewerToken) {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      }
    } catch {
      // quota / SSR — ignore
    }
  }

  /**
   * Returns a cached wildcard viewer token if fresh; otherwise null.
   * Triggers a background refresh if within REFRESH_AHEAD_MS of expiry.
   * NEVER awaits network — for hot path use.
   */
  getCached(): CachedViewerToken | null {
    const c = this.cached;
    if (!c) return null;
    const msLeft = c.expiresAtMs - Date.now();
    if (msLeft <= 0) {
      this.cached = null;
      try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
      return null;
    }
    if (msLeft < REFRESH_AHEAD_MS) {
      // background refresh — ignore result; we still return the live token
      void this.refresh();
    }
    return c;
  }

  /**
   * Force a mint/refresh. Dedupes concurrent calls.
   * Safe to fire-and-forget at app boot.
   */
  async refresh(): Promise<CachedViewerToken | null> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      try {
        // Must be logged in — anon users have no auth.uid, edge fn will 401
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session?.access_token) return null;

        const { data, error } = await supabase.functions.invoke(
          "livekit-viewer-wildcard-token",
          { body: {} }
        );
        if (error || !data?.token) return null;

        const value: CachedViewerToken = {
          token: data.token,
          url: data.url,
          identity: data.identity,
          expiresAtMs: (data.expiresAt as number) * 1000,
          cachedAtMs: Date.now(),
        };
        this.cached = value;
        this.persist(value);
        return value;
      } catch {
        return null;
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /**
   * Get a token, fetching if necessary. Awaits network only when no cache.
   */
  async getOrFetch(): Promise<CachedViewerToken | null> {
    const cached = this.getCached();
    if (cached) return cached;
    return this.refresh();
  }

  /** Clear on logout. */
  clear() {
    this.cached = null;
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
}

export const livekitTokenCache = new LiveKitTokenCache();

/**
 * Fire-and-forget pre-mint. Call once on app boot (or after sign-in).
 * Non-blocking — safe to call before auth is settled (it just no-ops).
 */
export const preMintViewerWildcardToken = () => {
  void livekitTokenCache.refresh();
};
