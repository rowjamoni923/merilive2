/**
 * UNIFIED ANIMATION MODULE
 * 
 * Single SVGAPlayer and animation players for the entire application.
 * All features MUST use these exports for consistency.
 * 
 * Use: import { SVGAPlayer, UniversalAnimationPlayer } from '@/features/shared/animations';
 */

// SINGLE SVGA Player - Used everywhere
export { default as SVGAPlayer, preloadSVGA, clearSVGACache } from '@/components/common/SVGAPlayer';

// Universal Player (auto-detects SVGA, Lottie, Video, Image)
export { default as UniversalAnimationPlayer, detectAnimationType } from '@/components/common/UniversalAnimationPlayer';

// Frame Player for Avatar Frames
export { default as UniversalFramePlayer } from '@/components/common/UniversalFramePlayer';

// VAP Player for Transparent Video
export { default as VAPPlayer } from '@/components/common/VAPPlayer';

// SVGA Player with Audio Support
export { default as SVGAPlayerWithAudio } from '@/components/common/SVGAPlayerWithAudio';

// Entry Animations
export { default as EntranceAnimation } from '@/components/level/EntranceAnimation';
export { default as EntryBarAnimation } from '@/components/level/EntryBarAnimation';
export { default as EntryBannerAnimation } from '@/components/live/EntryBannerAnimation';
export { default as EntryNameBarAnimation } from '@/components/live/EntryNameBarAnimation';
export { default as UnifiedEntryAnimation } from '@/components/live/UnifiedEntryAnimation';
export { default as UnifiedEntryEffects } from '@/components/room/UnifiedEntryEffects';
export { default as RoomEntranceNotification } from '@/components/live/RoomEntranceNotification';
export { default as VehicleEntranceAnimation } from '@/components/party/VehicleEntranceAnimation';

// Animation Hooks
export { useRoomEntryEffects } from '@/hooks/useRoomEntryEffects';
export { useEntryAnimations } from '@/hooks/useEntryAnimations';
