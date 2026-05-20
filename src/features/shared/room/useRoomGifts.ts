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

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!enabled || !roomId) return;

    console.log('[useRoomGifts] Setting up gift subscription for room:', roomId);

    // CRITICAL FIX: Subscribe WITHOUT filter because Supabase Realtime filters on UUID columns 
    // can fail silently. Instead, filter client-side for reliability.
    const channel = supabase
      .channel(`room-gifts-${roomId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gift_transactions' },
        async (payload: any) => {
          console.log('[useRoomGifts] 🎁 Gift transaction detected:', payload.new);
          
          if (!isMountedRef.current) return;
          
          // CLIENT-SIDE FILTER: Check if gift belongs to this room (stream_id OR party_room_id)
          const transactionStreamId = payload.new?.stream_id;
          const transactionPartyRoomId = payload.new?.party_room_id;
          const matchesRoom = transactionStreamId === roomId || transactionPartyRoomId === roomId;
          
          if (!matchesRoom) {
            console.log('[useRoomGifts] Skipping - different room:', { transactionStreamId, transactionPartyRoomId, roomId });
            return;
          }
          
          console.log('[useRoomGifts] 🎁 Gift is for THIS room, processing...');
          
          // Skip if this is our own gift (sender already triggered animation locally)
          const isOwnGift = payload.new?.sender_id === currentUserId;
          if (isOwnGift) {
            console.log('[useRoomGifts] Skipping own gift (already triggered locally)');
            return;
          }
          
          // Fetch gift and sender details
          const [giftResponse, senderResponse] = await Promise.all([
            supabase
              .from('gifts')
              .select('name, icon_url, animation_url, sound_url')
              .eq('id', payload.new.gift_id)
              .single(),
            supabase
              .from('profiles')
              .select('display_name, avatar_url, user_level')
              .eq('id', payload.new.sender_id)
              .single()
          ]);
          
          const gift = giftResponse.data;
          const sender = senderResponse.data;
          
          if (gift && isMountedRef.current) {
            console.log('[useRoomGifts] 🎁 PUBLIC ANIMATION - Showing to all:', gift.name, 'from', sender?.display_name);
            
            const giftCount = payload.new.quantity || 1;
            
            // Trigger gift animation for ALL other participants
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
            
            // Play gift sound
            onPlaySound?.();
          }
        }
      )
      .subscribe((status) => {
        console.log('[useRoomGifts] Subscription status:', status);
      });

    return () => {
      isMountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [roomId, currentUserId, onGiftReceived, onGiftChatMessage, onPlaySound, enabled]);

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
