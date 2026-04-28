/**
 * fetchEquippedBubbles
 * ---------------------------------
 * Resolves a user's currently-equipped chat-bubble animation URL.
 *
 * Sources (priority order):
 *   1. Active Noble subscription `chat_bubble_svga` (highest)
 *   2. Active VIP tier `chat_bubble_svga`
 *   3. Equipped shop purchase in category = 'bubble' (animation_url / animation_file_url)
 *
 * Results are cached per user for 60 seconds to avoid hammering DB inside chat loops.
 * Realtime invalidation: callers can `clearBubbleCache(userId)` when subscription / purchase changes.
 */

import { supabase } from '@/integrations/supabase/client';

interface CacheEntry {
  url: string | null;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

// In-flight dedupe so 50 simultaneous chat messages from same user = 1 query
const inflight = new Map<string, Promise<string | null>>();

export function clearBubbleCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

async function fetchBubbleForUser(userId: string): Promise<string | null> {
  try {
    // 1. Active Noble subscription chat bubble (highest priority)
    const { data: noble } = await (supabase as any)
      .from('user_noble_subscriptions')
      .select('noble_cards(custom_chat_bubble_url)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nobleUrl = noble?.noble_cards?.custom_chat_bubble_url;
    if (nobleUrl) return nobleUrl;

    // 2. Equipped shop bubble (category='bubble')
    const { data: purchase } = await (supabase as any)
      .from('user_purchases')
      .select('shop_items(category, animation_url, animation_file_url)')
      .eq('user_id', userId)
      .eq('is_equipped', true)
      .eq('is_active', true)
      .limit(20);
    if (Array.isArray(purchase)) {
      const bubbleItem = purchase.find((p: any) => p.shop_items?.category === 'bubble');
      const url = bubbleItem?.shop_items?.animation_file_url || bubbleItem?.shop_items?.animation_url;
      if (url) return url;
    }

    return null;
  } catch (err) {
    console.warn('[fetchEquippedBubble] failed for user', userId, err);
    return null;
  }
}

export async function getEquippedBubble(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;

  const cached = cache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.url;
  }

  const existing = inflight.get(userId);
  if (existing) return existing;

  const promise = fetchBubbleForUser(userId).then(url => {
    cache.set(userId, { url, fetchedAt: Date.now() });
    inflight.delete(userId);
    return url;
  });
  inflight.set(userId, promise);
  return promise;
}
