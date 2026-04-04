// Live Streaming Feature Module
// All live streaming related components, hooks, and pages

// Pages
export { default as GoLivePage } from '@/pages/GoLive';
export { default as LiveStreamPage } from '@/pages/LiveStream';
export { default as LivePage } from '@/pages/Live';

// Components (named exports)
export { AgoraVideoPlayer } from '@/components/live/AgoraVideoPlayer';
export { default as ChametStyleGoLive } from '@/components/live/ChametStyleGoLive';
export { CoHostPanel } from '@/components/live/CoHostPanel';
export { MusicPlayerPanel } from '@/components/live/MusicPlayerPanel';
export { PKBattleActive } from '@/components/live/PKBattleActive';
export { PKBattlePanel } from '@/components/live/PKBattlePanel';
export { PKBattleRequest } from '@/components/live/PKBattleRequest';
export { PKBattleResult } from '@/components/live/PKBattleResult';
export { PremiumViewerProfileCard } from '@/components/live/PremiumViewerProfileCard';
export { default as ProfessionalChatMessage } from '@/components/live/ProfessionalChatMessage';
export { default as ProfessionalHostInfo } from '@/components/live/ProfessionalHostInfo';
export { ScreenShareButton } from '@/components/live/ScreenShareButton';
export { ViewerListPanel } from '@/components/live/ViewerListPanel';
export { ViewerProfileCard } from '@/components/live/ViewerProfileCard';

// ========== SHARED ROOM SYSTEM (Live & Party unified) ==========
// These are now imported from shared/room for consistency
export { 
  FlyingJoinBannerContainer,
  FlyingJoinBanner,
  RoomChatOverlay,
  useFlyingJoinBanner,
  useStackingJoinNotifications,
  useRoomGifts,
  useRoomParticipants,
} from '@/features/shared/room';

// Legacy exports for backward compatibility
export { FlyingJoinBanner as FlyingJoinBannerLegacy, FlyingJoinBannerContainer as FlyingJoinBannerContainerLegacy, useFlyingJoinNotifications } from '@/components/live/FlyingJoinBanner';
export { StackingJoinNotificationsContainer, useStackingJoinNotifications as useStackingJoinNotificationsLegacy } from '@/components/live/StackingJoinNotifications';

// Hooks
export { useLiveStreamFilters } from '@/hooks/useLiveStreamFilters';
export { useLiveStreamLifecycle } from '@/hooks/useLiveStreamLifecycle';
export { useLiveStreamSocket } from '@/hooks/useLiveStreamSocket';
export { useLiveFaceDetection } from '@/hooks/useLiveFaceDetection';
export { useAgoraClient } from '@/hooks/useAgoraClient';

// Games in Live
export { useGlobalLiveGame } from '@/hooks/useGlobalLiveGame';
export { useLiveGameRound } from '@/hooks/useLiveGameRound';
export { useGameSound } from '@/hooks/useGameSound';

// Services
export * from '@/services/liveStreamService';
