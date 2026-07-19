/**
 * GIFT PREFETCH HOOK
 * 
 * Pre-loads all gift data on app initialization so gift panels
 * open instantly (<1 second) without loading states.
 * 
 * Usage: Call useGiftPrefetch() once in App.tsx or main layout
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
import { markVapCompositeHint } from '@/utils/vapDetection';
import { warmGiftUrlsForInstantPlay } from '@/utils/instantGiftWarmup';

// Global cache - shared across all components
interface GiftCacheItem {
  id: string;
  name: string;
  diamond_value: number;
  category: string;
  icon_url: string | null;
  animation_url: string | null;
  animation_format?: string | null;
  animation_config_url?: string | null;
  sound_url: string | null;
  display_order: number;
  min_level: number;
}

interface GiftCache {
  gifts: GiftCacheItem[];
  timestamp: number;
  loading: boolean;
  version: number;
}

// Module-level cache (singleton)
const giftCache: GiftCache = {
  gifts: [],
  timestamp: 0,
  loading: false,
  version: 0,
};

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const listeners: Set<() => void> = new Set();
let loadingPromise: Promise<GiftCacheItem[]> | null = null;
let clearEventInstalled = false;

const ensureGiftCacheClearEvent = () => {
  if (clearEventInstalled || typeof window === 'undefined') return;
  clearEventInstalled = true;
  window.addEventListener('gift-cache:clear', () => clearGiftCache());
};

function seedAnimationHints(gifts: GiftCacheItem[]): void {
  for (const gift of gifts) {
    const url = gift.animation_url;
    if (!url || !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) continue;
    if ((gift.animation_format || '').toLowerCase() === 'vap') {
      markVapCompositeHint(url, true);
    }
  }
}

/**
 * Fetch gifts and cache them globally
 */
export async function prefetchGifts(): Promise<GiftCacheItem[]> {
  ensureGiftCacheClearEvent();
  // Return cached if valid and not stale
  if (
    giftCache.gifts.length > 0 && 
    Date.now() - giftCache.timestamp < CACHE_DURATION
  ) {
    return giftCache.gifts;
  }

  // Prevent duplicate fetches
  if (giftCache.loading) {
    return loadingPromise ?? Promise.resolve(giftCache.gifts);
  }

  giftCache.loading = true;
  const requestVersion = giftCache.version;

  loadingPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('gifts')
        .select('id, name, diamond_value, category, icon_url, animation_url, animation_format, animation_config_url, sound_url, display_order, min_level')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('diamond_value', { ascending: true });

      if (error) {
        console.error('[GiftPrefetch] Error:', error);
        giftCache.loading = false;
        return giftCache.gifts;
      }

      if (requestVersion === giftCache.version) {
        giftCache.gifts = (data || []).map((gift) => ({
          ...gift,
          icon_url: normalizeGiftMediaUrl(gift.icon_url),
          animation_url: normalizeGiftMediaUrl(gift.animation_url),
          animation_format: (gift as any).animation_format || null,
          animation_config_url: normalizeGiftMediaUrl((gift as any).animation_config_url),
          sound_url: normalizeGiftMediaUrl(gift.sound_url),
          min_level: Number((gift as any).min_level ?? 0) || 0,
        }));
        seedAnimationHints(giftCache.gifts);
        // Warm icons (top 8) instantly so the panel grid renders zero-latency.
        warmGiftUrlsForInstantPlay(giftCache.gifts.slice(0, 8).flatMap((gift) => [gift.icon_url]));
        // 🚨 First-play fix: also warm the top 12 ANIMATION assets (MP4/SVGA
        // + sibling .json config) in the background at LOW priority + small
        // byte cap. This makes the very first send of popular gifts a cache
        // hit instead of a cold network fetch — eliminating the "first play
        // shows nothing, second play works" symptom. Persisted to Cache API
        // so it survives reloads.
        const topAnimAssets = giftCache.gifts.slice(0, 12).flatMap((g) => [
          g.animation_url,
          g.animation_config_url,
        ]);
        if (typeof window !== 'undefined' && topAnimAssets.length) {
          import('@/utils/vapWarmup')
            .then((m) =>
              m.warmupVapUrls(topAnimAssets, {
                warmJsonSibling: true,
                priority: 'low',
                maxBytes: 4 * 1024 * 1024,
                persist: true,
              }),
            )
            .catch(() => {});
        }
        giftCache.timestamp = Date.now();
        listeners.forEach(cb => cb());
      }

      console.log(`[GiftPrefetch] ✅ Cached ${giftCache.gifts.length} gifts`);
    } catch (e) {
      console.error('[GiftPrefetch] Failed:', e);
    } finally {
      giftCache.loading = false;
      loadingPromise = null;
    }

    return giftCache.gifts;
  })();

  return loadingPromise;
}

/**
 * Get cached gifts synchronously (returns empty if not yet fetched)
 */
export function getCachedGifts(): GiftCacheItem[] {
  ensureGiftCacheClearEvent();
  return giftCache.gifts;
}

/**
 * Get cached gifts or fetch if needed
 */
export async function getGiftsWithFetch(): Promise<GiftCacheItem[]> {
  if (giftCache.gifts.length > 0 && Date.now() - giftCache.timestamp < CACHE_DURATION) {
    return giftCache.gifts;
  }
  return prefetchGifts();
}

/**
 * Check if gifts are cached
 */
export function hasGiftCache(): boolean {
  return giftCache.gifts.length > 0;
}

/**
 * Subscribe to cache updates
 */
export function subscribeToGiftCache(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Clear the cache (call after admin updates gifts)
 */
export function clearGiftCache(): void {
  giftCache.version += 1;
  giftCache.gifts = [];
  giftCache.timestamp = 0;
  giftCache.loading = false;
  listeners.forEach(cb => cb());
}

/**
 * Hook to prefetch gifts on mount
 * Call this in App.tsx or main layout to pre-warm cache
 */
export function useGiftPrefetch(): void {
  const prefetched = useRef(false);

  useEffect(() => {
    if (prefetched.current) return;
    prefetched.current = true;

    // Prefetch immediately using idle callback for best performance
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(() => prefetchGifts(), { timeout: 200 });
      return () => cancelIdleCallback(id);
    }
    // Fallback: minimal delay
    const timer = setTimeout(() => {
      prefetchGifts();
    }, 100);

    return () => clearTimeout(timer);
  }, []);
}

/**
 * Hook to use cached gifts with real-time updates
 */
export function useCachedGifts() {
  const forceUpdate = useRef<() => void>();

  useEffect(() => {
    // Force re-render when cache updates
    const unsubscribe = subscribeToGiftCache(() => {
      forceUpdate.current?.();
    });

    // Prefetch if not already cached
    if (!hasGiftCache()) {
      prefetchGifts();
    }

    return unsubscribe;
  }, []);

  return {
    gifts: getCachedGifts(),
    isLoading: giftCache.loading && giftCache.gifts.length === 0,
    refetch: prefetchGifts,
  };
}

export default useGiftPrefetch;
