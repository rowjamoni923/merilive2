import { useState, useCallback, useRef } from "react";
import type { FlyingGift } from "@/components/live/FlyingGiftAnimation";

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
  // sender|gift -> active banner id and expiry
  const comboRef = useRef<Map<string, ComboTrack>>(new Map());

  const addGift = useCallback((gift: Omit<FlyingGift, 'id'>) => {
    const senderKey = `${gift.senderName}__${gift.giftName}__${gift.coins}`;
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
