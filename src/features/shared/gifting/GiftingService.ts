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
    icon_url: g.icon_url || g.animation_url,
    animation_url: g.animation_url,
    sound_url: g.sound_url,
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

    console.log('[GiftingService] ✅ Gift sent successfully:', {
      transaction_id: result.transactionId,
      coins_spent: result.coinsSpent,
      beans_earned: result.hostReceived,
      host_percent: result.hostPercent
    });

    // Pkg85: Instant My Diamond update for sender.
    // Prefer the server-returned post-transaction balance when present; otherwise
    // deduct the normalized coinsSpent value. This prevents zero/missing cache updates
    // when RPC response shapes differ across migrations.
    if (typeof result.newBalance === 'number' && Number.isFinite(result.newBalance)) {
      try {
        updateCachedBalance(Math.max(0, result.newBalance));
      } catch {}
    } else if (result.coinsSpent && result.coinsSpent > 0) {
      try {
        updateCachedBalance(Math.max(0, getCachedBalance() - result.coinsSpent));
      } catch {}
    }

    // ⚡ INSTANT BROADCAST: fire-and-forget so every viewer sees the animation
    // in <100ms (vs 1-3s postgres_changes latency).
    const broadcastRoomId = streamId || roomId;
    const liveKitScope: 'live' | 'party' | 'call' | null =
      context === 'live' ? 'live'
      : context === 'party' ? 'party'
      : context === 'call' ? 'call'
      : null;
    const liveKitId = streamId || roomId || callId;
    if (broadcastRoomId || (liveKitScope === 'call' && liveKitId)) {
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

          // Pkg82/83 LiveKit-Purist: publish via DataPacket for in-room scopes.
          if (liveKitScope && liveKitId) {
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
              giftSoundUrl: gift?.sound_url,
              count: quantity,
              giftCoins: gift?.coins || 0,
              totalCoins: result.coinsSpent || 0,
              receiverBeans: result.hostReceived || 0,
              timestamp: Date.now(),
            }).catch((err) => console.warn('[Pkg76] publishGiftSent failed:', err));
          }

          // Pkg88: LiveKit-Purist — Supabase `room-instant-${id}` broadcast REMOVED.
          // Its only consumer (`useRoomGifts`) is dead code, and Pkg78 deleted every
          // real receiver of legacy gift_broadcast_* channels. LiveKit DataPacket
          // above is the sole instant fanout path; postgres_changes via own-row
          // own-beans-updated event (Pkg85) reconciles within ~1s as safety net.

        } catch (err) {
          console.warn('[GiftingService] Broadcast failed (non-fatal):', err);
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
