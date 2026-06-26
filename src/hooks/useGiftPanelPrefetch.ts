import { useEffect, useRef } from 'react';
import { prefetchGiftIcons } from '@/utils/giftIconCache';
import { warmupSelectedVapUrls } from '@/utils/vapWarmup';

interface GiftLike {
  icon_url?: string | null;
  animation_url?: string | null;
  animation_config_url?: string | null;
  animation_format?: string | null;
  sound_url?: string | null;
}

/**
 * Phase 4B — Panel-open prefetch.
 *
 * Triggered when a gift panel becomes visible (sheet open / dialog mount).
 * - Persistently caches the visible icon URLs into IndexedDB.
 * - Warms the top-N animated payloads (VAP/MP4 + sibling config + sound)
 *   into Cache API so the first tap is ≤300 ms tap-to-frame.
 *
 * No-op if `open` is false.  Stable per `gifts` reference — won't refetch
 * on every render.  Bandwidth-respectful: only top-N animations are warmed
 * (N defaults to 8 — covers a typical viewport row).
 */
export function useGiftPanelPrefetch(
  open: boolean,
  gifts: ReadonlyArray<GiftLike> | null | undefined,
  options?: { topVap?: number; warmAllIcons?: boolean },
) {
  const lastSig = useRef<string>('');
  useEffect(() => {
    if (!open || !gifts || gifts.length === 0) return;
    const sig = gifts.length + ':' + (gifts[0]?.icon_url || '') + ':' + (gifts[gifts.length - 1]?.icon_url || '');
    if (sig === lastSig.current) return;
    lastSig.current = sig;

    // 1) Static icons — persistent IDB cache.
    const iconUrls = gifts
      .map(g => g.icon_url || null)
      .filter((u): u is string => !!u && !/(\.svga|\.json|\.mp4|\.webm)(\?|$)/i.test(u));
    if (iconUrls.length) prefetchGiftIcons(iconUrls);

    // 2) Animated payloads — warm top-N only (bandwidth conscious).
    const topN = options?.topVap ?? 8;
    const animatedUrls: string[] = [];
    for (let i = 0; i < Math.min(topN, gifts.length); i++) {
      const g = gifts[i];
      if (g.animation_url) animatedUrls.push(g.animation_url);
      if (g.animation_config_url) animatedUrls.push(g.animation_config_url);
      if (g.sound_url) animatedUrls.push(g.sound_url);
    }
    if (animatedUrls.length) warmupSelectedVapUrls(animatedUrls);
  }, [open, gifts, options?.topVap]);
}

export default useGiftPanelPrefetch;
