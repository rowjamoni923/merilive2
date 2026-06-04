/**
 * UNIFIED GIFTING SERVICE
 * 
 * This is the SINGLE source of truth for all gifting operations across the app.
 * Used in: Live Streams, Party Rooms, Private Calls, Chat, Profile
 * 
 * All features MUST use this service for gifting operations.
 */

import { supabase } from '@/integrations/supabase/client';
import { callGiftService } from '@/utils/giftServiceClient';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
// Pkg88: broadcastGiftSent import removed — Supabase channel was opening per gift
// with zero live consumers (LiveKit-Purist policy + $1400-rule).

import { publishGiftSent } from '@/lib/livekitGiftSignaling';
import { getCachedBalance, updateCachedBalance } from '@/hooks/useUserBalance';

export interface GiftItem {
  id: string;
  name: string;
  coins: number;
  category: string;
  icon_url?: string;
  animation_url?: string;
  animation_format?: string | null;
  animation_config_url?: string;
  sound_url?: string;
  animation_type?: string;
}

export interface GiftSendRequest {
  giftId: string;
  senderId: string;
  receiverId: string;
  quantity: number;
  context: 'live' | 'party' | 'call' | 'chat' | 'profile' | 'reel';
  roomId?: string;
  streamId?: string;
  callId?: string;
  reelId?: string;
}

export interface GiftSendResult {
  success: boolean;
  error?: string;
  transaction?: {
    id: string;
    coins_spent: number;
    beans_earned: number;
  };
  gift?: GiftItem;
}

// Cache for gifts to avoid repeated fetches
let giftsCache: GiftItem[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const normalizeGiftAssetUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  const normalizedGiftUrl = normalizeGiftMediaUrl(url);
  if (normalizedGiftUrl) return normalizedGiftUrl;
  if (url.startsWith('http')) return url;
  if (url.includes('/storage/v1/object/public/')) {
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${import.meta.env.VITE_SUPABASE_URL}${path}`;
  }
  if (url.startsWith('/')) return url;
  return url;
};

/**
 * Fetch all active gifts from database
 */
export async function fetchGifts(): Promise<GiftItem[]> {
  // Return cached if valid
  if (giftsCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return giftsCache;
  }

  const { data, error } = await supabase
    .from('gifts')
    .select('*')
    .eq('is_active', true)
    .order('coin_value', { ascending: true });

  if (error) {
    console.error('[GiftingService] Failed to fetch gifts:', error);
    return giftsCache || [];
  }

  giftsCache = (data || []).map(g => ({
    id: g.id,
    name: g.name,
    coins: g.coin_value, // Use coin_value from DB
    category: g.category || 'popular',
    icon_url: normalizeGiftAssetUrl(g.icon_url || g.animation_url),
    animation_url: normalizeGiftAssetUrl(g.animation_url),
    animation_format: g.animation_format || null,
    animation_config_url: normalizeGiftAssetUrl(g.animation_config_url),
    sound_url: normalizeGiftAssetUrl(g.sound_url),
    animation_type: g.animation_type,
  }));
  
  cacheTimestamp = Date.now();
  return giftsCache;
}

/**
 * Get a single gift by ID
 */
export async function getGiftById(giftId: string): Promise<GiftItem | null> {
  const gifts = await fetchGifts();
  return gifts.find(g => g.id === giftId) || null;
}

/**
 * Get gifts by category
 */
export async function getGiftsByCategory(category: string): Promise<GiftItem[]> {
  const gifts = await fetchGifts();
  if (category === 'all') return gifts;
  return gifts.filter(g => g.category === category);
}

/**
 * Send a gift - The SINGLE method for all gift sending
 * Uses atomic database function for secure transaction
 */
export async function sendGift(request: GiftSendRequest): Promise<GiftSendResult> {
  const { giftId, senderId, receiverId, quantity, context, streamId, roomId, callId, reelId } = request;

  // ⚡ ZERO-SECOND FANOUT: fire LiveKit envelope IMMEDIATELY (before RPC roundtrip).
  // Receivers see the flying gift + sound + chat row in <50ms instead of 300-650ms.
  // If the RPC later fails (insufficient coins, block, etc.) the sender's UI shows
  // an error, but the optimistic visual already played for everyone — acceptable
  // Chamet-class trade-off and matches in-call/in-party UX expectations.
  const liveKitScope: 'live' | 'party' | 'call' | null =
    context === 'live' ? 'live'
    : context === 'party' ? 'party'
    : context === 'call' ? 'call'
    : null;
  const liveKitId = streamId || roomId || callId;
  let optimisticPublished = false;
  if (liveKitScope && liveKitId) {
    try {
      const cachedGift = await getGiftById(giftId); // local cache hit — synchronous-fast
      // Resolve sender display info from local profile cache without blocking.
      // profiles_public is tiny and usually cached by other surfaces; we fire-and-forget.
      let senderName = 'Someone';
      let senderAvatar: string | undefined;
      let senderLevel: number | undefined;
      try {
        const { data: sp } = await supabase
          .from('profiles_public')
          .select('display_name, avatar_url, user_level')
          .eq('id', senderId)
          .maybeSingle();
        if (sp) {
          senderName = sp.display_name || senderName;
          senderAvatar = sp.avatar_url || undefined;
          senderLevel = (sp as any).user_level;
        }
      } catch { /* non-fatal */ }

      const unitCoins = cachedGift?.coins || 0;
      publishGiftSent(liveKitScope, liveKitId, {
        senderId,
        senderName,
        senderAvatar,
        senderLevel,
        receiverId,
        giftId,
        giftName: cachedGift?.name || 'Gift',
        giftIconUrl: cachedGift?.icon_url,
        giftAnimationUrl: cachedGift?.animation_url,
        giftAnimationFormat: cachedGift?.animation_format || null,
        giftAnimationConfigUrl: cachedGift?.animation_config_url,
        giftSoundUrl: cachedGift?.sound_url,
        count: quantity,
        giftCoins: unitCoins,
        totalCoins: unitCoins * quantity,
        receiverBeans: 0, // unknown until RPC settles — receiver beans counter reconciles via own-beans-updated
        timestamp: Date.now(),
      }).then((ok) => { optimisticPublished = !!ok; })
        .catch((err) => console.warn('[Pkg-Instant] optimistic publishGiftSent failed:', err));
    } catch (err) {
      console.warn('[GiftingService] optimistic publish prep failed:', err);
    }
  }

  try {
    console.log('[GiftingService] Processing gift transaction:', {
      giftId, senderId, receiverId, quantity, context
    });

    const result = await callGiftService({
      receiverId,
      giftId,
      quantity,
      streamId: context === 'live' ? streamId : null,
      partyRoomId: context === 'party' ? roomId : null,
      callId: context === 'call' ? callId : null,
      reelId: context === 'reel' ? reelId : null,
    });

    if (!result.success) {
      console.error('[GiftingService] Transaction failed:', result.error);
      return { success: false, error: result.error || 'Transaction failed' };
    }

    if (result.senderId && result.senderId !== senderId) {
      console.error('[GiftingService] Sender mismatch:', { requested: senderId, actual: result.senderId });
      return { success: false, error: 'Gift sender mismatch. Please refresh and try again.' };
    }

    console.log('[GiftingService] ✅ Gift sent successfully:', {
      transaction_id: result.transactionId,
      coins_spent: result.coinsSpent,
      beans_earned: result.hostReceived,
      host_percent: result.hostPercent
    });

    // Pkg85: Instant My Diamond update for sender.
    if (typeof result.newBalance === 'number' && Number.isFinite(result.newBalance)) {
      try {
        updateCachedBalance(Math.max(0, result.newBalance));
      } catch {}
    } else if (result.coinsSpent && result.coinsSpent > 0) {
      try {
        updateCachedBalance(Math.max(0, getCachedBalance() - result.coinsSpent));
      } catch {}
    }

    // Safety net: if optimistic publish did NOT actually fire (LiveKit disabled,
    // room not connected yet, kill-switch off), re-publish now with the verified
    // beans amount so receivers still see the gift via the legacy post-RPC path.
    if (liveKitScope && liveKitId && !optimisticPublished) {
      (async () => {
        try {
          const [gift, senderRes] = await Promise.all([
            getGiftById(giftId),
            supabase
              .from('profiles_public')
              .select('display_name, avatar_url, user_level')
              .eq('id', senderId)
              .maybeSingle(),
          ]);
          const senderName = senderRes.data?.display_name || 'Someone';
          const senderAvatar = senderRes.data?.avatar_url || undefined;
          const senderLevel = (senderRes.data as any)?.user_level;

          publishGiftSent(liveKitScope, liveKitId, {
            senderId,
            senderName,
            senderAvatar,
            senderLevel,
            receiverId,
            giftId,
            giftName: gift?.name || 'Gift',
            giftIconUrl: gift?.icon_url,
            giftAnimationUrl: gift?.animation_url,
            giftAnimationFormat: gift?.animation_format || null,
            giftAnimationConfigUrl: gift?.animation_config_url,
            giftSoundUrl: gift?.sound_url,
            count: quantity,
            giftCoins: gift?.coins || 0,
            totalCoins: result.coinsSpent || 0,
            receiverBeans: result.hostReceived || 0,
            timestamp: Date.now(),
          }).catch((err) => console.warn('[Pkg76] fallback publishGiftSent failed:', err));
        } catch (err) {
          console.warn('[GiftingService] fallback broadcast failed (non-fatal):', err);
        }
      })();
    }

    return {
      success: true,
      transaction: {
        id: result.transactionId || 'unknown',
        coins_spent: result.coinsSpent || 0,
        beans_earned: result.hostReceived || 0,
      },
      gift: {
        id: giftId,
        name: 'Gift',
        coins: result.coinsSpent || 0,
        category: 'popular',
      },
    };

  } catch (error) {
    console.error('[GiftingService] Send gift error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' };
  }
}


/**
 * Format coin value for display
 */
export function formatCoinValue(coins: number): string {
  if (coins >= 1000000) {
    return (coins / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (coins >= 1000) {
    return (coins / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return coins.toString();
}

/**
 * Clear gift cache (call when admin updates gifts)
 */
export function clearGiftCache(): void {
  giftsCache = null;
  cacheTimestamp = 0;
}

/**
 * Get animation type from URL
 */
export function getAnimationType(url: string): 'svga' | 'lottie' | 'video' | 'image' | 'emoji' {
  if (!url) return 'emoji';
  const lower = url.toLowerCase();
  if (lower.endsWith('.svga')) return 'svga';
  if (lower.endsWith('.json')) return 'lottie';
  if (lower.endsWith('.mp4') || lower.endsWith('.webm')) return 'video';
  if (lower.match(/\.(png|jpg|jpeg|gif|webp)$/)) return 'image';
  return 'emoji';
}
