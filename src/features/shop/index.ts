/**
 * SHOP FEATURE MODULE
 * 
 * Contains all components specific to the Shop/Store feature.
 * Isolated from other features - changes here don't affect Live, Party, etc.
 */

// Shop Page is at src/pages/Shop.tsx
// Recharge Page is at src/pages/Recharge.tsx

// Types
export interface ShopItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  priceType: 'diamonds' | 'real';
  category: 'frames' | 'gifts' | 'vip' | 'vehicles' | 'effects';
  previewUrl?: string;
  animationUrl?: string;
  isActive: boolean;
  isFeatured?: boolean;
}

export interface DiamondPackage {
  id: string;
  diamonds: number;
  bonusDiamonds: number;
  priceUSD: number;
  isPopular?: boolean;
  discount?: number;
}
