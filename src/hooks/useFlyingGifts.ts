import { useState, useCallback, useRef } from "react";
import type { FlyingGift } from "@/components/live/FlyingGiftAnimation";
import {
  enqueueFullScreenGift,
  getFullScreenGiftThreshold,
  isFullScreenGiftEnabled,
} from "@/hooks/useGlobalFullScreenGift";

/**
 * Combo-aware flying gift queue (Bigo / TikTok Live style).
 *
 * Behavior:
 *  - When the SAME sender sends the SAME gift again within `COMBO_WINDOW_MS`,
 *    the existing banner's count is incremented instead of pushing a new one.
 *  - Combo banners get an updated `comboKey` + fresh `lastUpdated` so the
 *    animation component can re-trigger the count-up + reset its dismiss timer.
 *  - Different sender / different gift => brand new banner stacked.
 */
const COMBO_WINDOW_MS = 4000;

type ComboTrack = {
  id: string;
  expiresAt: number;
};

export function useFlyingGifts() {
  const [gifts, setGifts] = useState<FlyingGift[]>([]);
  // sender|gift -> active banner id and expiry. Prefer stable senderId;
  // display names are not unique, so name-only merging can incorrectly combine
  // two different users who send the same gift within the combo window.
  const comboRef = useRef<Map<string, ComboTrack>>(new Map());

  const addGift = useCallback((gift: Omit<FlyingGift, 'id'>) => {
    const senderKey = `${gift.senderId || gift.senderName}__${gift.giftName}__${gift.diamonds}`;
    const now = Date.now();
    const existing = comboRef.current.get(senderKey);

    if (existing && existing.expiresAt > now) {
      // Merge into existing combo banner
      const newExpiry = now + COMBO_WINDOW_MS;
      comboRef.current.set(senderKey, { id: existing.id, expiresAt: newExpiry });
      setGifts(prev => prev.map(g => {
        if (g.id !== existing.id) return g;
        const mergedCount = (g.count || 1) + (gift.count || 1);
        return {
          ...g,
          ...gift,
          id: g.id,
          count: mergedCount,
          // bump comboKey so FlyingGiftAnimation re-runs its count-up + reset timer
          comboKey: now,
          beansEarned: typeof gift.beansEarned === 'number'
            ? (g.beansEarned || 0) + gift.beansEarned
            : g.beansEarned,
        } as FlyingGift;
      }));
      return existing.id;
    }

    // Brand new banner
    const newId = `${now}-${Math.random().toString(36).slice(2, 7)}`;
    const newGift: FlyingGift = {
      ...gift,
      id: newId,
      comboKey: now,
    };
    comboRef.current.set(senderKey, { id: newId, expiresAt: now + COMBO_WINDOW_MS });
    setGifts(prev => [...prev, newGift]);

    // Auto-route high-value gifts to the global full-screen animation layer.
    // Every gift-capable surface benefits without page-level wiring.
    const perUnitDiamonds = gift.diamonds || 0;
    if (isFullScreenGiftEnabled() && perUnitDiamonds >= getFullScreenGiftThreshold()) {
      try {
        enqueueFullScreenGift({
          gift: {
            id: newId,
            name: gift.giftName,
            icon_url: gift.giftImageUrl || gift.giftIcon,
            animation_url: gift.animationUrl,
            sound_url: gift.soundUrl,
            diamond_value: perUnitDiamonds,
          },
          senderName: gift.senderName,
          senderAvatar: gift.senderAvatar,
          receiverName: gift.receiverName || '',
          quantity: gift.count || 1,
        });
      } catch { /* non-blocking */ }
    }

    return newId;
  }, []);

  const removeGift = useCallback((id: string) => {
    setGifts(prev => prev.filter(g => g.id !== id));
    // Clear matching combo tracker
    for (const [k, v] of comboRef.current.entries()) {
      if (v.id === id) comboRef.current.delete(k);
    }
  }, []);

  return { gifts, addGift, removeGift };
}
