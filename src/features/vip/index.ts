/**
 * VIP MEMBERSHIP FEATURE MODULE
 * 
 * Contains all components specific to VIP membership management.
 * Isolated from other features - changes here don't affect Live, Party, etc.
 * 
 * Note: VIP animations/frames are in shared/animations and shared/frames
 */

// VIP Page is at src/pages/VIP.tsx

// Types
export interface VIPTier {
  id: string;
  tier: number;
  name: string;
  priceDiamonds: number;
  durationDays: number;
  benefits: string[];
  frameUrl?: string;
  badgeUrl?: string;
  entryBarUrl?: string;
  chatBubbleUrl?: string;
}

export interface UserVIPStatus {
  userId: string;
  currentTier: number;
  expiresAt: Date | null;
  isActive: boolean;
}
