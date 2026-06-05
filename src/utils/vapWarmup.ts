/**
 * VAP / MP4 WARMUP — Pkg424 (instant entry & gift play)
 *
 * Pre-fetches animation media bytes into the browser HTTP cache so that
 * when the actual <VAPPlayer> / <EntryVAPPlayer> mounts, the video element
 * can start playing immediately from cache instead of waiting on the
 * network round-trip.
 *
 * Strategy:
 *   1. fetch(url, { cache: 'force-cache' }) — populates HTTP cache for the
 *      MP4/JSON. Subsequent <video src=url> mount reuses these bytes.
 *   2. In-flight Map de-duplicates parallel warms of the same URL.
 *   3. Done Set short-circuits already-warmed URLs.
 *   4. Fire-and-forget — never throws, never blocks the caller.
 *
 * This is intentionally additive only — it does NOT touch playback flow,
 * does NOT replace existing logic, and is safe to call any number of times.
 */

import { normalizePublicMediaUrl } from '@/lib/cdnImage';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';

const done = new Set<string>();
const inFlight = new Map<string, Promise<void>>();
const MAX_DONE = 400; // keep memory bounded

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
 * Warm a single media URL into the HTTP cache.
 * Returns a promise that resolves whether warm succeeded or failed.
 */
export function warmupVapUrl(rawUrl?: string | null): Promise<void> {
  const url = resolveUrl(rawUrl);
  if (!url) return Promise.resolve();
  if (done.has(url)) return Promise.resolve();
  const existing = inFlight.get(url);
  if (existing) return existing;

  const p = (async () => {
    try {
      // GET (not HEAD) — HEAD would not populate the body cache for video bytes.
      // mode 'cors' so the browser's media cache can reuse the bytes when the
      // <video crossOrigin="anonymous"> element later requests the same URL.
      const res = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'force-cache',
        // @ts-ignore — Chrome/Edge supports priority hint
        priority: 'low',
      });
      // Drain the body so the browser stores it in the cache.
      if (res.ok && res.body) {
        try { await res.arrayBuffer(); } catch { /* noop */ }
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
export function warmupVapUrls(urls: Array<string | null | undefined>, options?: { warmJsonSibling?: boolean }): void {
  const warmJsonSibling = options?.warmJsonSibling !== false;
  for (const u of urls) {
    if (!u) continue;
    void warmupVapUrl(u);
    // VAP players probe a sibling .json config — warm it too.
    if (warmJsonSibling && /\.(mp4|webm)(\?|$)/i.test(u)) {
      const jsonSibling = u.replace(/\.(mp4|webm)(\?|$)/i, '.json$2');
      if (jsonSibling !== u) void warmupVapUrl(jsonSibling);
    }
  }
}

/**
 * Warm a full entry-animation payload (entrance + vehicle + name bar + sounds).
 */
export function warmupEntryAnimationPayload(p: {
  entranceUrl?: string | null;
  entryNameBarUrl?: string | null;
  vehicleAnimationUrl?: string | null;
  soundUrl?: string | null;
}): void {
  warmupVapUrls([p.entranceUrl, p.entryNameBarUrl, p.vehicleAnimationUrl, p.soundUrl]);
}
