/**
 * =====================================================
 * INSTANT ROOM BROADCAST SYSTEM
 * =====================================================
 * 
 * Uses Supabase Broadcast channels for sub-100ms delivery.
 * postgres_changes has 1-3s latency; broadcast is instant.
 * 
 * ONE LINK = BOTH PARTY ROOM & LIVE STREAM
 * =====================================================
 */

import { supabase } from '@/integrations/supabase/client';

export interface BroadcastJoinPayload {
  userId: string;
  userName: string;
  userAvatar?: string;
  userLevel: number;
  equippedEntranceId?: string | null;
  equippedEntryNameBarId?: string | null;
  equippedVehicleId?: string | null;
  entranceAnimationUrl?: string;
  entryNameBarUrl?: string;
  vehicleAnimationUrl?: string;
  timestamp: number;
}

export interface BroadcastGiftPayload {
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  giftId: string;
  giftName: string;
  giftIconUrl?: string;
  giftAnimationUrl?: string;
  giftSoundUrl?: string;
  quantity: number;
  coinAmount: number;
  beansEarned: number;
  timestamp: number;
}

/**
 * Get the broadcast channel name for a room
 */
function getRoomChannelName(roomId: string): string {
  return `room-instant-${roomId}`;
}

/**
 * Broadcast a viewer join event instantly to all room participants
 */
export function broadcastViewerJoin(roomId: string, payload: BroadcastJoinPayload) {
  const channel = supabase.channel(getRoomChannelName(roomId));
  
  // Subscribe then send (channel may already be subscribed by listener)
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      channel.send({
        type: 'broadcast',
        event: 'viewer-join',
        payload,
      });
      console.log('[RoomBroadcast] ⚡ Instant join broadcast sent for:', payload.userName);
    }
  });
}

/**
 * Broadcast a gift event instantly to all room participants
 */
export function broadcastGiftSent(roomId: string, payload: BroadcastGiftPayload) {
  const channel = supabase.channel(getRoomChannelName(roomId));
  
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      channel.send({
        type: 'broadcast',
        event: 'gift-sent',
        payload,
      });
      console.log('[RoomBroadcast] ⚡ Instant gift broadcast sent:', payload.giftName, 'from', payload.senderName);
    }
  });
}

/**
 * Subscribe to instant room broadcasts (join + gift events)
 * Returns cleanup function
 */
export function subscribeToRoomBroadcasts(
  roomId: string,
  callbacks: {
    onViewerJoin?: (payload: BroadcastJoinPayload) => void;
    onGiftSent?: (payload: BroadcastGiftPayload) => void;
  }
): () => void {
  const channelName = getRoomChannelName(roomId);
  
  const channel = supabase
    .channel(channelName)
    .on('broadcast', { event: 'viewer-join' }, (msg) => {
      console.log('[RoomBroadcast] ⚡ Instant join received:', msg.payload?.userName);
      callbacks.onViewerJoin?.(msg.payload as BroadcastJoinPayload);
    })
    .on('broadcast', { event: 'gift-sent' }, (msg) => {
      console.log('[RoomBroadcast] ⚡ Instant gift received:', msg.payload?.giftName);
      callbacks.onGiftSent?.(msg.payload as BroadcastGiftPayload);
    })
    .subscribe((status) => {
      console.log(`[RoomBroadcast] Channel ${channelName} status:`, status);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
