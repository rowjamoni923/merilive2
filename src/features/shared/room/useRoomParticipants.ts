/**
 * =====================================================
 * UNIFIED ROOM PARTICIPANT SUBSCRIPTION HOOK
 * =====================================================
 * 
 * ONE LINK = ONE CHANGE = BOTH PARTY ROOM & LIVE STREAM UPDATED
 * 
 * Real-time participant subscription that works for:
 * - Live Streams (stream_viewers table)
 * - Party Rooms (party_room_participants table)
 * 
 * Shows join notifications to ALL participants:
 * - Host sees when viewers join
 * - Joining user sees their own join animation
 * - All visitors see join animations
 * 
 * =====================================================
 */

import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { JoinNotification } from './types';
import { fetchUserEntryAnimations } from '@/utils/fetchEntryAnimation';

interface UseRoomParticipantsOptions {
  /** Room/Stream ID */
  roomId: string;
  /** 'live' for stream_viewers, 'party' for party_room_participants */
  roomType: 'live' | 'party';
  /** Callback when a user joins */
  onUserJoin: (notification: Omit<JoinNotification, 'id' | 'timestamp'>) => void;
  /** Optional callback for entry effects */
  onTriggerEntryEffect?: (params: {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    level: number;
    entranceUrl?: string;
    entryNameBarUrl?: string;
    vehicleAnimationUrl?: string;
  }) => void;
  /** Whether hook is active */
  enabled?: boolean;
}

export function useRoomParticipants({
  roomId,
  roomType,
  onUserJoin,
  onTriggerEntryEffect,
  enabled = true,
}: UseRoomParticipantsOptions) {
  const isMountedRef = useRef(true);
  
  // CRITICAL FIX: Store callbacks in refs to prevent stale closures
  const onUserJoinRef = useRef(onUserJoin);
  const onTriggerEntryEffectRef = useRef(onTriggerEntryEffect);
  
  // Keep refs in sync with latest callbacks
  useEffect(() => {
    onUserJoinRef.current = onUserJoin;
    onTriggerEntryEffectRef.current = onTriggerEntryEffect;
  }, [onUserJoin, onTriggerEntryEffect]);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!enabled || !roomId) return;

    const tableName = roomType === 'live' ? 'stream_viewers' : 'party_room_participants';
    const filterColumn = roomType === 'live' ? 'stream_id' : 'room_id';
    const userIdColumn = roomType === 'live' ? 'viewer_id' : 'user_id';

    console.log(`[useRoomParticipants] Setting up ${roomType} subscription for room:`, roomId);

    const channel = supabase
      .channel(`room-participants-${roomId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: tableName, filter: `${filterColumn}=eq.${roomId}` },
        async (payload: any) => {
          const userId = payload.new?.[userIdColumn];
          console.log(`[useRoomParticipants] 👤 User joined:`, userId);
          
          if (!userId || !isMountedRef.current) return;

          // Fetch user profile with entry effect info
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url, user_level, equipped_entrance_id, equipped_entry_name_bar_id, equipped_vehicle_id')
            .eq('id', userId)
            .single();

          if (!profile || !isMountedRef.current) return;

          const userName = profile.display_name || 'User';
          const userLevel = profile.user_level || 1;
          const avatarUrl = profile.avatar_url || undefined;

          // Add join notification - VISIBLE TO ALL (including the joining user)
          // Use ref to get latest callback and avoid stale closure
          onUserJoinRef.current({
            userId,
            userName,
            userLevel,
            userAvatar: avatarUrl,
          });

          // Trigger entry effects if callback provided
          const triggerCallback = onTriggerEntryEffectRef.current;
          if (triggerCallback) {
            // Fetch entrance animation URL - uses centralized function that checks ALL tables
            // Now also includes vehicle animation and level-based auto-assign!
            const { entranceAnimationUrl: entranceUrl, entryNameBarUrl, vehicleAnimationUrl } = await fetchUserEntryAnimations(
              profile.equipped_entrance_id,
              profile.equipped_entry_name_bar_id,
              profile.equipped_vehicle_id,
              userLevel
            );

            if (entranceUrl) {
              console.log('[useRoomParticipants] 🎭 Found equipped entrance animation:', entranceUrl);
            }
            if (vehicleAnimationUrl) {
              console.log('[useRoomParticipants] 🚗 Found equipped vehicle animation:', vehicleAnimationUrl);
            }

            // ONLY trigger if user has equipped items - no fallbacks
            if ((entranceUrl || entryNameBarUrl || vehicleAnimationUrl) && isMountedRef.current) {
              triggerCallback({
                userId,
                displayName: userName,
                avatarUrl,
                level: userLevel,
                entranceUrl,
                entryNameBarUrl,
                vehicleAnimationUrl,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log(`[useRoomParticipants] Subscription status:`, status);
      });

    return () => {
      isMountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [roomId, roomType, enabled]); // Note: callbacks are accessed via refs, not directly

  return null;
}
