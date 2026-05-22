import { useEffect, useRef } from 'react';
import { JoinNotification } from './types';
import type { LiveEventDetail, ViewerJoinedPayload } from '@/lib/livekitLiveEventsSignaling';
import type { PartyEventDetail, ParticipantJoinedPayload } from '@/lib/livekitPartyEventsSignaling';

interface UseRoomParticipantsOptions {
  roomId: string;
  roomType: 'live' | 'party';
  onUserJoin: (notification: Omit<JoinNotification, 'id' | 'timestamp'>) => void;
  onTriggerEntryEffect?: (params: {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    level: number;
    entranceUrl?: string;
    entryNameBarUrl?: string;
    vehicleAnimationUrl?: string;
    soundUrl?: string;
  }) => void;
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
  const onUserJoinRef = useRef(onUserJoin);
  const onTriggerEntryEffectRef = useRef(onTriggerEntryEffect);

  useEffect(() => {
    onUserJoinRef.current = onUserJoin;
    onTriggerEntryEffectRef.current = onTriggerEntryEffect;
  }, [onUserJoin, onTriggerEntryEffect]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!enabled || !roomId) return;

    const handleJoined = (payload: ViewerJoinedPayload | ParticipantJoinedPayload) => {
      if (!isMountedRef.current) return;
      const userName = payload.userName || 'User';
      const userLevel = payload.userLevel || 1;
      const userAvatar = payload.userAvatar || undefined;

      onUserJoinRef.current({ userId: payload.userId, userName, userLevel, userAvatar });

      if (onTriggerEntryEffectRef.current && (payload.entranceAnimationUrl || payload.entryNameBarUrl || payload.vehicleAnimationUrl)) {
        onTriggerEntryEffectRef.current({
          userId: payload.userId,
          displayName: userName,
          avatarUrl: userAvatar,
          level: userLevel,
          entranceUrl: payload.entranceAnimationUrl || undefined,
          entryNameBarUrl: payload.entryNameBarUrl || undefined,
          vehicleAnimationUrl: payload.vehicleAnimationUrl || undefined,
          soundUrl: payload.entranceSoundUrl || undefined,
        });
      }
    };

    const onLiveEvent = (event: Event) => {
      if (roomType !== 'live') return;
      const payload = (event as CustomEvent<LiveEventDetail>).detail?.payload;
      if (payload?.type === 'viewer_joined' && payload.streamId === roomId) handleJoined(payload);
    };

    const onPartyEvent = (event: Event) => {
      if (roomType !== 'party') return;
      const payload = (event as CustomEvent<PartyEventDetail>).detail?.payload;
      if (payload?.type === 'participant_joined' && payload.roomId === roomId) handleJoined(payload);
    };

    window.addEventListener('livekit-live-event', onLiveEvent);
    window.addEventListener('livekit-party-event', onPartyEvent);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('livekit-live-event', onLiveEvent);
      window.removeEventListener('livekit-party-event', onPartyEvent);
    };
  }, [roomId, roomType, enabled]);

  return null;
}