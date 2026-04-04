/**
 * UNIFIED GIFTING SERVICE
 * 
 * This is the SINGLE source of truth for all gifting operations across the app.
 * Used in: Live Streams, Party Rooms, Private Calls, Chat, Profile
 * 
 * All features MUST use this service for gifting operations.
 */

import { supabase } from '@/integrations/supabase/client';

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
  context: 'live' | 'party' | 'call' | 'chat' | 'profile';
  roomId?: string;
  streamId?: string;
  callId?: string;
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
 * Get host commission rate from settings
 * CRITICAL: Returns 0 if not configured - never use hardcoded defaults
 */
async function getHostCommissionRate(): Promise<number> {
  const { data } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'gift_commission')
    .single();
  
  const value = data?.setting_value as any;
  if (value?.host_percent && typeof value.host_percent === 'number' && value.host_percent > 0) {
    return value.host_percent;
  }
  
  console.warn('[GiftingService] ⚠️ gift_commission not configured in Admin Panel! Using 0%');
  return 0;
}

/**
 * Send a gift - The SINGLE method for all gift sending
 * Uses atomic database function for secure transaction
 */
export async function sendGift(request: GiftSendRequest): Promise<GiftSendResult> {
  const { giftId, senderId, receiverId, quantity, context, streamId, roomId, callId } = request;

  try {
    console.log('[GiftingService] Processing gift transaction:', {
      giftId, senderId, receiverId, quantity, context
    });

    // Use atomic database function for secure gift transaction
    const { data, error } = await supabase.rpc('process_gift_transaction', {
      p_sender_id: senderId,
      p_receiver_id: receiverId,
      p_gift_id: giftId,
      p_quantity: quantity,
      p_stream_id: context === 'live' ? streamId : null,
      p_party_room_id: context === 'party' ? roomId : null,
      p_call_id: context === 'call' ? callId : null,
    });

    if (error) {
      console.error('[GiftingService] RPC error:', error);
      return { success: false, error: error.message };
    }

    const result = data as {
      success: boolean;
      error?: string;
      transaction_id?: string;
      coins_spent?: number;
      beans_earned?: number;
      host_percent?: number;
      gift_name?: string;
      gift_icon_url?: string;
      gift_animation_url?: string;
    };

    if (!result.success) {
      console.error('[GiftingService] Transaction failed:', result.error);
      return { success: false, error: result.error || 'Transaction failed' };
    }

    console.log('[GiftingService] ✅ Gift sent successfully:', {
      transaction_id: result.transaction_id,
      coins_spent: result.coins_spent,
      beans_earned: result.beans_earned,
      host_percent: result.host_percent
    });

    return {
      success: true,
      transaction: {
        id: result.transaction_id || 'unknown',
        coins_spent: result.coins_spent || 0,
        beans_earned: result.beans_earned || 0,
      },
      gift: {
        id: giftId,
        name: result.gift_name || 'Gift',
        coins: result.coins_spent || 0,
        category: 'popular',
        icon_url: result.gift_icon_url,
        animation_url: result.gift_animation_url,
      },
    };

  } catch (error) {
    console.error('[GiftingService] Send gift error:', error);
    return { success: false, error: 'An unexpected error occurred' };
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
