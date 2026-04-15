import { useState, useCallback } from "react";
import type { FlyingGift } from "@/components/live/FlyingGiftAnimation";

/**
 * Hook to manage flying gift queue - supports stacking up to 2 banners
 * Extracted from FlyingGiftAnimation.tsx for Vite Fast Refresh compatibility
 */
export function useFlyingGifts() {
  const [gifts, setGifts] = useState<FlyingGift[]>([]);

  const addGift = useCallback((gift: Omit<FlyingGift, 'id'>) => {
    const newGift: FlyingGift = {
      ...gift,
      id: `${Date.now()}-${Math.random()}`,
    };
    setGifts(prev => [...prev, newGift]);
  }, []);

  const removeGift = useCallback((id: string) => {
    setGifts(prev => prev.filter(g => g.id !== id));
  }, []);

  return { gifts, addGift, removeGift };
}
