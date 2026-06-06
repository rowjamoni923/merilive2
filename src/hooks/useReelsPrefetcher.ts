/**
 * Pkg435 — Native Video Pre-cache hook (Phase A #1).
 *
 * Given the ordered list of reel video URLs and the user's current index,
 * this hook tells the native ExoPlayer SimpleCache to warm the next-N
 * (default 3) URLs in the background so swiping forward shows the first
 * frame INSTANTLY (no buffering spinner).
 *
 * Strictly additive:
 *   - No-op on web / iOS / native plugin missing / flag OFF.
 *   - Cancels the in-flight batch whenever the current index changes
 *     so the latest scroll position wins (never wastes bytes warming
 *     reels the user already scrolled past).
 *   - Skips URLs already fully cached (handled inside the plugin).
 *   - Never blocks playback — purely background.
 *
 * Usage (in Reels.tsx):
 *
 *   useReelsPrefetcher(reels.map(r => r.video_url), currentIndex);
 */

import { useEffect, useRef } from 'react';
import {
  cancelNativeReelsPrefetch,
  tryNativeReelsPrefetchBatch,
} from '@/plugins/NativeReelsPlayer';
import { isVideoPrecacheEnabled } from '@/utils/videoPrecacheNativeFlag';

interface Options {
  /** How many forward reels to warm. Default 3. */
  ahead?: number;
  /** How many backward reels to keep warm (for swipe-back). Default 1. */
  behind?: number;
  /** Bytes to warm per URL (~2 MB default covers first 3-5 s of 720p). */
  bytesPerUrl?: number;
}

export function useReelsPrefetcher(
  urls: ReadonlyArray<string | null | undefined>,
  currentIndex: number,
  opts: Options = {},
): void {
  const ahead = Math.max(0, opts.ahead ?? 3);
  const behind = Math.max(0, opts.behind ?? 1);
  const bytesPerUrl = opts.bytesPerUrl;

  // Debounce so a fast finger-flick scrolling through 20 reels in 1s
  // doesn't fire 20 batches — only the final resting index queues.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isVideoPrecacheEnabled()) return;
    if (!urls || urls.length === 0) return;
    if (currentIndex < 0 || currentIndex >= urls.length) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const start = Math.max(0, currentIndex - behind);
      const end = Math.min(urls.length - 1, currentIndex + ahead);
      const batch: string[] = [];
      for (let i = start; i <= end; i++) {
        if (i === currentIndex) continue; // already playing — skip
        const u = urls[i];
        if (typeof u === 'string' && u.length > 0) batch.push(u);
      }
      if (batch.length === 0) return;
      // Cancel any older batch first (newest scroll wins) — the plugin
      // also self-cancels but doing it client-side too avoids a brief
      // window where stale URLs keep downloading.
      void cancelNativeReelsPrefetch().finally(() => {
        void tryNativeReelsPrefetchBatch(batch, bytesPerUrl);
      });
    }, 250);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // urls.length covers feed grow; joining the slice is cheaper than
    // depending on the whole array reference (parents often re-create it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, urls.length, ahead, behind, bytesPerUrl]);

  // On unmount, cancel any in-flight warming so a screen the user has
  // left doesn't keep eating their data plan.
  useEffect(() => {
    return () => {
      void cancelNativeReelsPrefetch();
    };
  }, []);
}
