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

// Global cache - shared across all components
interface GiftCacheItem {
  id: string;
  name: string;
  coin_value: number;
  category: string;
  icon_url: string | null;
  animation_url: string | null;
  display_order: number;
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

/**
 * Fetch gifts and cache them globally
 */
export async function prefetchGifts(): Promise<GiftCacheItem[]> {
  // Return cached if valid and not stale
  if (
    giftCache.gifts.length > 0 && 
    Date.now() - giftCache.timestamp < CACHE_DURATION
  ) {
    return giftCache.gifts;
  }

  // Prevent duplicate fetches
  if (giftCache.loading) {
    // Wait for current fetch to complete
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!giftCache.loading) {
          clearInterval(checkInterval);
          resolve(giftCache.gifts);
        }
      }, 50);
    });
  }

  giftCache.loading = true;
  const requestVersion = giftCache.version;

  try {
    const { data, error } = await supabase
      .from('gifts')
      .select('id, name, coin_value, category, icon_url, animation_url, sound_url, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('coin_value', { ascending: true });

    if (error) {
      console.error('[GiftPrefetch] Error:', error);
      giftCache.loading = false;
      return giftCache.gifts;
    }

    if (requestVersion === giftCache.version) {
      giftCache.gifts = data || [];
      giftCache.timestamp = Date.now();
      listeners.forEach(cb => cb());
    }

    console.log(`[GiftPrefetch] ✅ Cached ${giftCache.gifts.length} gifts`);
  } catch (e) {
    console.error('[GiftPrefetch] Failed:', e);
  } finally {
    giftCache.loading = false;
  }

  return giftCache.gifts;
}

/**
 * Get cached gifts synchronously (returns empty if not yet fetched)
 */
export function getCachedGifts(): GiftCacheItem[] {
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
