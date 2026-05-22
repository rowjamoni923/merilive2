/**
 * =====================================================
 * UNIFIED ROOM SYSTEM
 * =====================================================
 * 
 * ONE LINK = ONE CHANGE = BOTH PARTY ROOM & LIVE STREAM UPDATED
 * 
 * This is the UNIFIED room system for the entire app.
 * All components and hooks here work for both:
 * - Live Streams
 * - Party Rooms (Audio, Video, Game)
 * 
 * =====================================================
 */

// Types
export type { 
  JoinNotification, 
  RoomChatMessage, 
  FlyingGiftData,
  RoomType,
  RoomParticipant,
  UseJoinNotificationsReturn,
  UseFlyingJoinBannerReturn,
} from './types';

// Components
export { 
  FlyingJoinBannerContainer, 
  FlyingJoinBanner 
} from './FlyingJoinBanner';

export { 
  RoomChatOverlay, 
  WelcomeMessage,
  JoinNotificationItem, 
  ChatMessageItem 
} from './RoomChatOverlay';

// Hooks
export { 
  useStackingJoinNotifications, 
  useFlyingJoinBanner 
} from './useRoomJoinNotifications';

export { 
  useRoomGifts, 
  useLocalGiftTrigger 
} from './useRoomGifts';

export { 
  useRoomParticipants 
} from './useRoomParticipants';

// Supabase room broadcasts are retired. Room fanout uses LiveKit DataPackets.
