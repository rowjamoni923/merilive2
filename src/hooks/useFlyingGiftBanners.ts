import { useState } from "react";

interface FlyingGiftBannerData {
  senderName: string;
  senderAvatar?: string;
  senderLevel?: number;
  receiverName: string;
  giftName: string;
  giftIcon: string;
  giftImageUrl?: string;
  giftAnimationUrl?: string;
  count: number;
  coins: number;
}

/**
 * Hook to manage flying gift banner queue
 * Extracted from PremiumFlyingGiftBanner.tsx for Vite Fast Refresh compatibility
 */
export const useFlyingGiftBanners = () => {
  const [banners, setBanners] = useState<Array<{
    id: string;
    props: FlyingGiftBannerData;
  }>>([]);

  const addBanner = (props: FlyingGiftBannerData) => {
    const id = `${Date.now()}-${Math.random()}`;
    setBanners(prev => [...prev, { id, props }]);
    return id;
  };

  const removeBanner = (id: string) => {
    setBanners(prev => prev.filter(b => b.id !== id));
  };

  return { banners, addBanner, removeBanner };
};
