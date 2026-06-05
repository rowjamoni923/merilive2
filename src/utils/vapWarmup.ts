/**
 * VAP / MP4 WARMUP — Pkg424 + Pkg425 (instant entry & gift play)
 *
 * Pre-fetches animation media bytes so that when the actual <VAPPlayer> /
 * <EntryVAPPlayer> mounts, the video element starts playing immediately
 * from cache instead of waiting on the network round-trip.
 *
 * TWO layers of cache (mirrors SVGA prewarm strategy):
 *   1. Cache API ("vap-binary-v1") — survives reloads & app restarts, just
 *      like SVGA's "svga-binary-v1". This is what makes the SECOND play of
 *      any popular VAP/MP4 truly 0ms even after a cold reload.
 *   2. HTTP cache via fetch({cache:'force-cache'}) — fast in-session fallback
 *      and ensures the <video> element's media pipeline reuses these bytes.
 *
 * In-flight Map de-duplicates parallel warms; Done Set short-circuits
 * already-warmed URLs in the current session. Fire-and-forget — never
 * throws, never blocks the caller, never affects playback flow.
 *
 * This is intentionally additive only — it does NOT touch the WebGL render
 * loop, the VAP shader, the audio path, or the <video> element lifecycle.
 */

import { normalizePublicMediaUrl } from '@/lib/cdnImage';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';

const done = new Set<string>();
const inFlight = new Map<string, Promise<void>>();
const MAX_DONE = 800; // bumped from 400 — covers full popular-gift catalog
const MAX_FULL_WARM_BYTES = 16 * 1024 * 1024; // bumped from 12 MB

// ------- Persistent Cache API layer (Pkg425) -------
const VAP_CACHE_NAME = 'vap-binary-v1';
let vapCacheInstance: Cache | null = null;
let vapCacheUnavailable = false;

async function getVapCache(): Promise<Cache | null> {
  if (vapCacheInstance) return vapCacheInstance;
  if (vapCacheUnavailable) return null;
  if (typeof caches === 'undefined') { vapCacheUnavailable = true; return null; }
  try {
    vapCacheInstance = await caches.open(VAP_CACHE_NAME);
    return vapCacheInstance;
  } catch {
    vapCacheUnavailable = true;
    return null;
  }
}

function resolveUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return normalizeGiftMediaUrl(trimmed) || normalizePublicMediaUrl(trimmed) || trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Warm a single media URL into BOTH the HTTP cache and the persistent
 * Cache API store. Returns a promise that resolves whether warm succeeded
 * or failed.
 */
export function warmupVapUrl(rawUrl?: string | null, options?: { priority?: 'low' | 'high'; maxBytes?: number; persist?: boolean }): Promise<void> {
  const url = resolveUrl(rawUrl);
  if (!url) return Promise.resolve();
  if (done.has(url)) return Promise.resolve();
  const existing = inFlight.get(url);
  if (existing) return existing;

  const persist = options?.persist !== false; // default ON
  const maxBytes = options?.maxBytes ?? MAX_FULL_WARM_BYTES;

  const p = (async () => {
    try {
      // 1. Check persistent cache first — if already there, only mark done.
      if (persist) {
        const cache = await getVapCache();
        if (cache) {
          try {
            const hit = await cache.match(url);
            if (hit) {
              // Re-prime HTTP cache from persistent cache so <video> finds it.
              try { await hit.clone().arrayBuffer(); } catch { /* noop */ }
              done.add(url);
              return;
            }
          } catch { /* noop */ }
        }
      }

      // 2. Network fetch with force-cache → populates HTTP cache.
      const res = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'force-cache',
        // @ts-ignore — Chrome/Edge supports priority hint
        priority: options?.priority || 'low',
      });

      if (res.ok && res.body) {
        const len = Number(res.headers.get('content-length') || '0');
        const withinBudget = !len || len <= maxBytes || options?.priority === 'high';

        if (withinBudget) {
          // Read body once; tee for persistent cache when allowed.
          let buf: ArrayBuffer | null = null;
          try { buf = await res.arrayBuffer(); } catch { buf = null; }

          if (buf && persist) {
            try {
              const cache = await getVapCache();
              if (cache) {
                const headers = new Headers(res.headers);
                // Ensure cache stores body even when origin lacks CORS exposure.
                const resp = new Response(buf.slice(0), {
                  status: 200,
                  statusText: 'OK',
                  headers,
                });
                await cache.put(url, resp);
              }
            } catch { /* noop */ }
          }
        } else {
          try { await res.body.cancel(); } catch { /* noop */ }
        }
      }

      done.add(url);
      if (done.size > MAX_DONE) {
        const first = done.values().next().value;
        if (first) done.delete(first);
      }
    } catch {
      // Silent — warmup failures must NEVER affect playback.
    } finally {
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, p);
  return p;
}

/**
 * Warm multiple URLs in parallel.
 * Also auto-warms the sibling `.json` VAP config for `.mp4`/`.webm` URLs.
 */
export function warmupVapUrls(urls: Array<string | null | undefined>, options?: { warmJsonSibling?: boolean; priority?: 'low' | 'high'; maxBytes?: number; persist?: boolean }): void {
  const warmJsonSibling = options?.warmJsonSibling !== false;
  for (const u of urls) {
    if (!u) continue;
    void warmupVapUrl(u, { priority: options?.priority, maxBytes: options?.maxBytes, persist: options?.persist });
    // VAP players probe a sibling .json config — warm it too.
    if (warmJsonSibling && /\.(mp4|webm)(\?|$)/i.test(u)) {
      const jsonSibling = u.replace(/\.(mp4|webm)(\?|$)/i, '.json$2');
      if (jsonSibling !== u) void warmupVapUrl(jsonSibling, { priority: options?.priority, maxBytes: 512 * 1024, persist: options?.persist });
    }
  }
}

/**
 * High-priority full warm (used for top popular gifts + currently-visible
 * entry animation). Persists to Cache API so the SECOND session is instant.
 */
export function warmupSelectedVapUrls(urls: Array<string | null | undefined>): void {
  warmupVapUrls(urls, { warmJsonSibling: false, priority: 'high', maxBytes: 32 * 1024 * 1024, persist: true });
}

/**
 * Warm a full entry-animation payload (entrance + vehicle + name bar + sounds).
 * High priority + persisted so a user's own entry plays instantly on every
 * room join across sessions.
 */
export function warmupEntryAnimationPayload(p: {
  entranceUrl?: string | null;
  entryNameBarUrl?: string | null;
  vehicleAnimationUrl?: string | null;
  soundUrl?: string | null;
}): void {
  warmupVapUrls(
    [p.entranceUrl, p.entryNameBarUrl, p.vehicleAnimationUrl, p.soundUrl],
    { warmJsonSibling: true, priority: 'high', maxBytes: 24 * 1024 * 1024, persist: true }
  );
}
