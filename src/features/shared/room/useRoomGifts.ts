import { useCallback, useEffect, useRef } from 'react';
import { FlyingGiftData } from './types';
import type { GiftSentDetail } from '@/lib/livekitGiftSignaling';
import { warmIncomingGiftForInstantPlay } from '@/utils/instantGiftWarmup';

interface UseRoomGiftsOptions {
  roomId: string;
  currentUserId: string | null;
  onGiftReceived: (gift: FlyingGiftData) => void;
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
  onPlaySound?: () => void;
  enabled?: boolean;
}

export function useRoomGifts({
  roomId,
  currentUserId,
  onGiftReceived,
  onPlaySound,
  enabled = true,
}: UseRoomGiftsOptions) {
  const isMountedRef = useRef(true);
  const onGiftReceivedRef = useRef(onGiftReceived);
  const onPlaySoundRef = useRef(onPlaySound);

  useEffect(() => {
    onGiftReceivedRef.current = onGiftReceived;
    onPlaySoundRef.current = onPlaySound;
  }, [onGiftReceived, onPlaySound]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!enabled || !roomId) return;

    const onGift = (event: Event) => {
      const detail = (event as CustomEvent<GiftSentDetail>).detail;
      if (!detail || detail.id !== roomId || detail.senderId === currentUserId || !isMountedRef.current) return;

      warmIncomingGiftForInstantPlay({
        icon_url: detail.giftIconUrl || null,
        animation_url: detail.giftAnimationUrl || null,
        animation_format: detail.giftAnimationFormat || null,
        animation_config_url: detail.giftAnimationConfigUrl || null,
        sound_url: detail.giftSoundUrl || null,
      });

      onGiftReceivedRef.current({
        id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        senderName: detail.senderName || 'Someone',
        giftName: detail.giftName || 'Gift',
        giftIcon: '🎁',
        giftImageUrl: detail.giftIconUrl || detail.giftIcon,
        animationUrl: detail.giftAnimationUrl || detail.giftIconUrl || detail.giftIcon,
        animationFormat: detail.giftAnimationFormat || null,
        animationConfigUrl: detail.giftAnimationConfigUrl || undefined,
        soundUrl: detail.giftSoundUrl,
        giftColor: 'from-pink-500 to-purple-500',
        count: detail.count || 1,
        diamonds: detail.totalDiamonds || detail.giftCoins || 0,
      });
      onPlaySoundRef.current?.();
    };

    window.addEventListener('livekit-gift-sent', onGift);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener('livekit-gift-sent', onGift);
    };
  }, [roomId, currentUserId, enabled]);

  return null;
}

export function useLocalGiftTrigger(onGiftReceived: (gift: FlyingGiftData) => void) {
  const triggerLocalGift = useCallback((params: {
    senderName: string;
    gift: { name: string; icon_url?: string; animation_url?: string };
    count: number;
    diamonds: number;
  }) => {
    onGiftReceived({
      id: `local_gift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderName: params.senderName,
      giftName: params.gift.name,
      giftIcon: '🎁',
      giftImageUrl: params.gift.icon_url || undefined,
      animationUrl: params.gift.animation_url || params.gift.icon_url || undefined,
      animationFormat: (params.gift as any).animation_format || null,
      animationConfigUrl: (params.gift as any).animation_config_url || undefined,
      giftColor: 'from-pink-500 to-purple-500',
      count: params.count,
      diamonds: params.diamonds,
    });
  }, [onGiftReceived]);

  return { triggerLocalGift };
}