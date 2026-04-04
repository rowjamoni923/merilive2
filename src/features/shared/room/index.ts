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

// Instant Broadcast System (sub-100ms delivery)
export {
  broadcastViewerJoin,
  broadcastGiftSent,
  subscribeToRoomBroadcasts,
} from './roomBroadcast';

export type {
  BroadcastJoinPayload,
  BroadcastGiftPayload,
} from './roomBroadcast';
