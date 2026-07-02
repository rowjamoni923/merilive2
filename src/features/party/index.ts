// Party Room Feature Module
// Video Party, Audio Party, Game Party - All unified

// Pages
export { default as PartyRoomsPage } from '@/pages/PartyRooms';
export { default as PartyRoomPage } from '@/pages/PartyRoom';
export { default as CreatePartyPage } from '@/pages/CreateParty';

// Main Party Components
export { default as UnifiedPartyRoom } from '@/components/party/UnifiedPartyRoom';
export { default as ProfessionalAudioRoom } from '@/components/party/ProfessionalAudioRoom';
export { ChametStyleVideoRoom } from '@/components/party/ChametStyleVideoRoom';
export { default as ChametStyleGameRoom } from '@/components/party/ChametStyleGameRoom';

// Party UI Components
export { default as ChametStyleHeader } from '@/components/party/ChametStyleHeader';
export { default as ChametStyleSeatGrid } from '@/components/party/ChametStyleSeatGrid';
export { default as ChametStyleBottomBar } from '@/components/party/ChametStyleBottomBar';
export { default as ChametStyleChatPanel } from '@/components/party/ChametStyleChatPanel';
export { default as ChametStyleCloseModal } from '@/components/party/ChametStyleCloseModal';
export { default as ChametStyleGameBanners } from '@/components/party/ChametStyleGameBanners';
export { default as ChametStyleSettingsPanel } from '@/components/party/ChametStyleSettingsPanel';
export { default as ChametStyleViewerPanel } from '@/components/party/ChametStyleViewerPanel';

// Party Advanced Components
export { default as AdvancedPartyBottomBar } from '@/components/party/AdvancedPartyBottomBar';
export { default as BackgroundPickerPanel } from '@/components/party/BackgroundPickerPanel';
export { default as DynamicPartyBanners } from '@/components/party/DynamicPartyBanners';
export { GameSelectionModal } from '@/components/party/GameSelectionModal';
export { default as LayoutPickerPanel } from '@/components/party/LayoutPickerPanel';
export { PartyMusicPlayer } from '@/components/party/PartyMusicPlayer';
export { default as MusicPlayerPanelParty } from '@/components/party/MusicPlayerPanel';
export { ParticipantVideo } from '@/components/party/ParticipantVideo';
// PartyGiftPanel removed 2026-07-02 — use canonical GiftPanel from '@/features/shared/gifting'
export { default as PartyRoomBottomBar } from '@/components/party/PartyRoomBottomBar';
export { default as ProfessionalBottomBar } from '@/components/party/ProfessionalBottomBar';
export { default as ProfessionalGameOverlay } from '@/components/party/ProfessionalGameOverlay';
export { default as ProfessionalSeatGrid } from '@/components/party/ProfessionalSeatGrid';
export { default as VehicleEntranceAnimation } from '@/components/party/VehicleEntranceAnimation';

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

// Party Hooks
export { usePartyRoomNativeLiveKit } from '@/hooks/usePartyRoomNativeLiveKit';
export { useVoiceActivityDetection } from '@/hooks/useVoiceActivityDetection';
// PR-2.3 cleanup: useSignalingSocket export removed — unused (zero consumers).

// Games (used in party game rooms)
export { default as GameBoard } from '@/components/games/GameBoard';
export { GameCategoryTabs } from '@/components/games/GameCategoryTabs';
export { GameSelector } from '@/components/games/GameSelector';
export { GlobalGameOverlay } from '@/components/games/GlobalGameOverlay';
export { default as LiveGameBoard } from '@/components/games/LiveGameBoard';
export { LiveGameSelector } from '@/components/games/LiveGameSelector';
export { default as CompactGameFooter } from '@/components/games/CompactGameFooter';
export { default as GameFooterNew } from '@/components/games/GameFooterNew';
