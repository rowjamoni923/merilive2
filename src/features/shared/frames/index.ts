/**
 * UNIFIED FRAME SYSTEM
 * 
 * Single source for ALL avatar frames across the app.
 * Change here = Change everywhere (Profile, Chat, Live, Party, Leaderboard)
 * 
 * Usage: import { AvatarWithFrame, Premium3DFrame } from '@/features/shared/frames';
 */

// Core Frame Components
export { default as AvatarWithFrame } from '@/components/common/AvatarWithFrame';
export { default as FramedAvatar } from '@/components/common/FramedAvatar';
export { default as FramedAvatarWithPrivileges } from '@/components/common/FramedAvatarWithPrivileges';
export { default as Premium3DFrame } from '@/components/common/Premium3DFrame';
export { default as PremiumAvatarFrame } from '@/components/common/PremiumAvatarFrame';
export { default as LevelFrame } from '@/components/common/LevelFrame';

// Frame Player (supports SVGA, GIF, PNG, Lottie)
export { default as UniversalFramePlayer } from '@/components/common/UniversalFramePlayer';

// Types
export interface FrameData {
  id: string;
  name: string;
  frameUrl: string;
  previewUrl?: string;
  minLevel?: number;
  isPremium?: boolean;
  animationType?: 'svga' | 'gif' | 'lottie' | 'static';
}

export interface UserFrameConfig {
  userId: string;
  equippedFrameId?: string;
  userLevel: number;
  vipTier?: number;
}
