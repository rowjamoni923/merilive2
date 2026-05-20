/**
 * =====================================================
 * UNIFIED ROOM GIFT SUBSCRIPTION HOOK
 * =====================================================
 * 
 * ONE LINK = ONE CHANGE = BOTH PARTY ROOM & LIVE STREAM UPDATED
 * 
 * Real-time gift subscription that works for:
 * - Live Streams (stream_id)
 * - Party Rooms (room_id uses stream_id column)
 * 
 * Shows gift animations to ALL participants:
 * - Host sees gifts
 * - Sender gets instant feedback (local trigger)
 * - All visitors see gifts via real-time subscription
 * 
 * =====================================================
 */

import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FlyingGiftData } from './types';
import { subscribeToRoomBroadcasts } from './roomBroadcast';

interface UseRoomGiftsOptions {
  /** Room/Stream ID */
  roomId: string;
  /** Current user ID (to skip own gifts in subscription) */
  currentUserId: string | null;
  /** Callback when a gift is received from real-time */
  onGiftReceived: (gift: FlyingGiftData) => void;
  /** Optional callback to add gift message to chat */
  onGiftChatMessage?: (message: {
    id: string;
    user: string;
    initial: string;
    message: string;
    color: string;
    userLevel: number;
    userAvatar?: string;
    isHost: boolean;
    isNewUser: boolean;
  }) => void;
  /** Optional callback to play sound */
  onPlaySound?: () => void;
  /** Whether hook is active */
  enabled?: boolean;
}

export function useRoomGifts({
  roomId,
  currentUserId,
  onGiftReceived,
  onGiftChatMessage,
  onPlaySound,
  enabled = true,
}: UseRoomGiftsOptions) {
  const isMountedRef = useRef(true);
  // De-dup keys shared by both broadcast + postgres_changes paths
  const seenKeysRef = useRef<Map<string, number>>(new Map());

  const markSeen = useCallback((key: string): boolean => {
    const now = Date.now();
    // GC entries older than 15s
    for (const [k, t] of seenKeysRef.current) {
      if (now - t > 15000) seenKeysRef.current.delete(k);
    }
    if (seenKeysRef.current.has(key)) return false;
    seenKeysRef.current.set(key, now);
    return true;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled || !roomId) return;

    console.log('[useRoomGifts] Setting up gift subscription for room:', roomId);

    // ⚡ INSTANT path: broadcast channel (sub-100ms)
    const unsubBroadcast = subscribeToRoomBroadcasts(roomId, {
      onGiftSent: (payload) => {
        if (!isMountedRef.current) return;
        // Skip own gift (sender already triggered locally)
        if (payload.senderId === currentUserId) return;

        const key = `bcast:${payload.senderId}:${payload.giftId}:${payload.timestamp}`;
        if (!markSeen(key)) return;
        // Also mark a coarse dedup so the slower postgres_changes path is suppressed
        markSeen(`gift:${payload.senderId}:${payload.giftId}:${Math.floor(payload.timestamp / 2000)}`);

        console.log('[useRoomGifts] ⚡ Instant gift via broadcast:', payload.giftName);
        onGiftReceived({
          id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          senderName: payload.senderName,
          giftName: payload.giftName,
          giftIcon: '🎁',
          giftImageUrl: payload.giftIconUrl,
          animationUrl: payload.giftAnimationUrl || payload.giftIconUrl,
          soundUrl: payload.giftSoundUrl,
          giftColor: 'from-pink-500 to-purple-500',
          count: payload.quantity,
          coins: payload.coinAmount,
        });
        onPlaySound?.();
      },
    });

    // 🛟 Fallback path: postgres_changes (1-3s) — handles missed broadcasts
    const channel = supabase
      .channel(`room-gifts-${roomId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gift_transactions' },
        async (payload: any) => {
          if (!isMountedRef.current) return;

          const transactionStreamId = payload.new?.stream_id;
          const transactionPartyRoomId = payload.new?.party_room_id;
          const matchesRoom = transactionStreamId === roomId || transactionPartyRoomId === roomId;
          if (!matchesRoom) return;

          const isOwnGift = payload.new?.sender_id === currentUserId;
          if (isOwnGift) return;

          // De-dup with broadcast path: if broadcast already fired within ~2s, skip
          const createdMs = payload.new?.created_at ? new Date(payload.new.created_at).getTime() : Date.now();
          const coarseKey = `gift:${payload.new.sender_id}:${payload.new.gift_id}:${Math.floor(createdMs / 2000)}`;
          if (!markSeen(coarseKey)) {
            console.log('[useRoomGifts] Skipping pg gift — already shown via broadcast');
            return;
          }

          const [giftResponse, senderResponse] = await Promise.all([
            supabase.from('gifts').select('name, icon_url, animation_url, sound_url').eq('id', payload.new.gift_id).single(),
            supabase.from('profiles').select('display_name, avatar_url, user_level').eq('id', payload.new.sender_id).single(),
          ]);

          const gift = giftResponse.data;
          const sender = senderResponse.data;

          if (gift && isMountedRef.current) {
            const giftCount = payload.new.quantity || 1;
            onGiftReceived({
              id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              senderName: sender?.display_name || 'Someone',
              giftName: gift.name,
              giftIcon: '🎁',
              giftImageUrl: gift.icon_url || undefined,
              animationUrl: gift.animation_url || gift.icon_url || undefined,
              soundUrl: gift.sound_url || undefined,
              giftColor: 'from-pink-500 to-purple-500',
              count: giftCount,
              coins: payload.new.coin_amount || 0,
            });
            onPlaySound?.();
          }
        }
      )
      .subscribe((status) => {
        console.log('[useRoomGifts] Subscription status:', status);
      });

    return () => {
      isMountedRef.current = false;
      unsubBroadcast();
      supabase.removeChannel(channel);
    };
  }, [roomId, currentUserId, onGiftReceived, onGiftChatMessage, onPlaySound, enabled, markSeen]);

  return null;
}

/**
 * Hook for local gift trigger (for sender's instant feedback)
 * Returns a function to trigger gift animation locally
 */
export function useLocalGiftTrigger(onGiftReceived: (gift: FlyingGiftData) => void) {
  const triggerLocalGift = useCallback((params: {
    senderName: string;
    gift: { name: string; icon_url?: string; animation_url?: string };
    count: number;
    coins: number;
  }) => {
    onGiftReceived({
      id: `local_gift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderName: params.senderName,
      giftName: params.gift.name,
      giftIcon: '🎁',
      giftImageUrl: params.gift.icon_url || undefined,
      animationUrl: params.gift.animation_url || params.gift.icon_url || undefined,
      giftColor: 'from-pink-500 to-purple-500',
      count: params.count,
      coins: params.coins,
    });
  }, [onGiftReceived]);

  return triggerLocalGift;
}
