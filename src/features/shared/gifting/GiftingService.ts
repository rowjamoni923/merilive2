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
import { getCachedGifts } from '@/hooks/useGiftPrefetch';
// Pkg88: broadcastGiftSent import removed — Supabase channel was opening per gift
// with zero live consumers (LiveKit-Purist policy + $1400-rule).

import { publishGiftSent } from '@/lib/livekitGiftSignaling';
import { getCachedBalance, updateCachedBalance } from '@/hooks/useUserBalance';
import { getVapCompositeHint, markVapCompositeHint } from '@/utils/vapDetection';
import { detectProfessionalAnimationFormat } from '@/utils/animationFormat';
import { warmGiftForInstantPlay } from '@/utils/instantGiftWarmup';
import { emitLuckyWin } from '@/components/lucky/LuckyGiftHost';


export interface GiftItem {
  id: string;
  name: string;
  diamonds: number;
  category: string;
  icon_url?: string | null;
  animation_url?: string | null;
  animation_format?: string | null;
  animation_config_url?: string | null;
  sound_url?: string | null;
  animation_type?: string;
}

export interface GiftSendRequest {
  giftId: string;
  gift?: GiftItem;
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
    diamonds_spent: number;
    beans_earned: number;
    /** Lucky-gift diamond bonus paid to sender (0 when no win). */
    diamond_bonus?: number;
    /** True when the gift had is_lucky=true. */
    is_lucky?: boolean;
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

const isVideoAsset = (url?: string | null): boolean => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url || '');

const getProfessionalGiftFormat = (gift?: Pick<GiftItem, 'animation_url' | 'animation_format'> | null): string | null => {
  if (!gift?.animation_url) return gift?.animation_format || null;
  if ((gift.animation_format || '').toLowerCase() === 'vap') {
    markVapCompositeHint(gift.animation_url, true);
  }
  return gift.animation_format || (getVapCompositeHint(gift.animation_url) ? 'vap' : detectProfessionalAnimationFormat(gift.animation_url));
};

const normalizeGiftIconUrl = (iconUrl?: string | null, animationUrl?: string | null): string | undefined => {
  const icon = normalizeGiftAssetUrl(iconUrl);
  if (icon && !isVideoAsset(icon)) return icon;
  const anim = normalizeGiftAssetUrl(animationUrl);
  if (anim && !isVideoAsset(anim)) return anim;
  return undefined;
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
    .order('diamond_value', { ascending: true });

  if (error) {
    console.error('[GiftingService] Failed to fetch gifts:', error);
    return giftsCache || [];
  }

  giftsCache = (data || []).map(g => ({
    id: g.id,
    name: g.name,
    diamonds: g.diamond_value, // Use diamond_value from DB
    category: g.category || 'popular',
    icon_url: normalizeGiftIconUrl(g.icon_url, g.animation_url),
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
  const prefetched = getCachedGifts().find(g => g.id === giftId);
  if (prefetched) {
    return {
      id: prefetched.id,
      name: prefetched.name,
      diamonds: prefetched.diamond_value,
      category: prefetched.category || 'popular',
      icon_url: normalizeGiftIconUrl(prefetched.icon_url, prefetched.animation_url),
      animation_url: normalizeGiftAssetUrl(prefetched.animation_url),
      animation_format: prefetched.animation_format || null,
      animation_config_url: normalizeGiftAssetUrl(prefetched.animation_config_url),
      sound_url: normalizeGiftAssetUrl(prefetched.sound_url),
    };
  }
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
  const { giftId, gift: requestGift, senderId, receiverId, quantity, context, streamId, roomId, callId, reelId } = request;
  warmGiftForInstantPlay(requestGift || null);

  // ⚡ ZERO-SECOND FANOUT: fire LiveKit envelope IMMEDIATELY (before RPC roundtrip).
  // Receivers see the flying gift + sound + chat row in <50ms instead of 300-650ms.
  // If the RPC later fails (insufficient diamonds, block, etc.) the sender's UI shows
  // an error, but the optimistic visual already played for everyone — acceptable
  // Chamet-class trade-off and matches in-call/in-party UX expectations.
  const liveKitScope: 'live' | 'party' | 'call' | null =
    context === 'live' ? 'live'
    : context === 'party' ? 'party'
    : context === 'call' ? 'call'
    : null;
  const liveKitId = streamId || roomId || callId;
  let optimisticPublished = false;
  let optimisticPublishPromise: Promise<boolean> | null = null;
  if (liveKitScope && liveKitId) {
    try {
      const cachedGift = requestGift || await getGiftById(giftId); // caller metadata = zero network wait
      const unitCoins = cachedGift?.diamonds || 0;
      const hintedFormat = getProfessionalGiftFormat(cachedGift);
      const optimisticPayload = {
        senderId,
        senderName: 'Someone',
        receiverId,
        giftId,
        giftName: cachedGift?.name || 'Gift',
        giftIconUrl: cachedGift?.icon_url || undefined,
        giftAnimationUrl: cachedGift?.animation_url || undefined,
        giftAnimationFormat: hintedFormat,
        giftAnimationConfigUrl: cachedGift?.animation_config_url || undefined,
        giftSoundUrl: cachedGift?.sound_url || undefined,
        count: quantity,
        giftCoins: unitCoins,
        totalDiamonds: unitCoins * quantity,
        receiverBeans: 0, // unknown until RPC settles — receiver beans counter reconciles via own-beans-updated
        timestamp: Date.now(),
      };

      // Phase 6 — Sender-local zero-ms paint. LiveKit does NOT echo data
      // packets back to the publisher, so without this the sender would only
      // see their own flying gift / chat row AFTER the RPC settles
      // (300-650ms). Fire a synthetic `livekit-gift-sent` event locally so
      // every UI surface that already listens (LiveStream, PartyRoom,
      // ActiveCallScreen, in-room chat) paints in <16ms.
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('livekit-gift-sent', {
            detail: {
              ...optimisticPayload,
              scope: liveKitScope,
              id: liveKitId,
              sender: senderId,
              __selfOptimistic: true,
            },
          }));
        } catch {}
      }

      optimisticPublishPromise = publishGiftSent(liveKitScope, liveKitId, optimisticPayload).then((ok) => {
        optimisticPublished = !!ok;
        return optimisticPublished;
      })
        .catch((err) => {
          console.warn('[Pkg-Instant] optimistic publishGiftSent failed:', err);
          return false;
        });
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
      diamonds_spent: result.diamondsSpent,
      beans_earned: result.hostReceived,
      host_percent: result.hostPercent,
      diamond_bonus: result.diamondBonus,
      is_lucky: result.isLucky,
    });

    // Pkg85: Instant My Diamond update for sender.
    // newBalance from RPC already reflects (initial - spent + luckyBonus).
    if (typeof result.newBalance === 'number' && Number.isFinite(result.newBalance)) {
      try {
        updateCachedBalance(Math.max(0, result.newBalance));
      } catch {}
    } else if (result.diamondsSpent && result.diamondsSpent > 0) {
      try {
        const net = getCachedBalance() - result.diamondsSpent + (result.diamondBonus || 0);
        updateCachedBalance(Math.max(0, net));
      } catch {}
    }

    // 🎰 LUCKY GIFT WIN — tier-aware fullscreen celebration. Lottery-style UX:
    //   Any paid bonus → LuckyGiftCelebration, so users always see the returned
    //   bonus diamonds immediately after sending a lucky gift.
    // See plan.md → "Lucky Gift Lottery — Chamet-Style Mega Jackpot".
    if (result.isLucky && (result.diamondBonus || 0) > 0) {
      const spent = result.diamondsSpent || 0;
      const bonus = result.diamondBonus || 0;
      try {
        // Resolve gift meta for the celebration card icon.
        let giftIconUrl: string | undefined;
        let giftName: string | undefined;
        try {
          const cached = getCachedGifts?.() || [];
          const g = cached.find((x: any) => x.id === giftId);
          if (g) {
            giftIconUrl = (g as any).icon_url || undefined;
            giftName = (g as any).name || undefined;
          }
        }
        catch {}
        emitLuckyWin({ spent, bonus, giftIconUrl, giftName });
      } catch {}
    }

    // Safety net: if optimistic publish did NOT actually fire (LiveKit disabled,
    // room not connected yet, kill-switch off), re-publish now with the verified
    // beans amount so receivers still see the gift via the legacy post-RPC path.
    const didOptimisticPublish = optimisticPublished || await (optimisticPublishPromise?.catch(() => false) ?? Promise.resolve(false));
    if (liveKitScope && liveKitId && !didOptimisticPublish) {
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
          const hintedFormat = getProfessionalGiftFormat(gift);

          publishGiftSent(liveKitScope, liveKitId, {
            senderId,
            senderName,
            senderAvatar,
            senderLevel,
            receiverId,
            giftId,
            luckyBonus: result.diamondBonus || 0,
          }).catch((err) => console.warn('[Pkg76] fallback publishGiftSent failed:', err));
        } catch (err) {
          console.warn('[GiftingService] fallback broadcast failed (non-fatal):', err);
        }

      })();
    }

    return {
      success: true,
      transaction: {
      },
      gift: {
        name: 'Gift',
        diamonds: result.diamondsSpent || 0,
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
export function formatCoinValue(diamonds: number): string {
  if (diamonds >= 1000000) {
    return (diamonds / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (diamonds >= 1000) {
    return (diamonds / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return diamonds.toString();
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
