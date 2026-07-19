/**
 * =====================================================
 * UNIFIED ROOM SYSTEM - SHARED TYPES
 * =====================================================
 * 
 * ONE LINK = ONE CHANGE = BOTH PARTY ROOM & LIVE STREAM UPDATED
 * 
 * This file contains all shared types for:
 * - Join Notifications
 * - Chat Messages
 * - Gift Animations
 * - Viewer Panel
 * 
 * =====================================================
 */

// ============= JOIN NOTIFICATION TYPES =============
export interface JoinNotification {
  id: string;
  oderId?: string; // Optional order reference
  userId: string;
  userName: string;
  userAvatar?: string;
  userLevel: number;
  timestamp: number;
}

// ============= CHAT MESSAGE TYPES =============
export interface RoomChatMessage {
  id: string;
  userId?: string;
  user: string;
  initial: string;
  message: string;
  color?: string;
  userLevel?: number;
  userAvatar?: string;
  isHost?: boolean;
  isNewUser?: boolean;
  countryFlag?: string;
  isTrader?: boolean;
  traderLevel?: number;
  type?: 'text' | 'system' | 'gift' | 'join' | 'leave';
  timestamp?: Date;
  /** Designer chat bubble (SVGA / Lottie / animated image) — wraps the message text */
  bubbleUrl?: string | null;
}

// ============= GIFT ANIMATION TYPES =============
export interface FlyingGiftData {
  id: string;
  senderName: string;
  giftName: string;
  giftIcon: string;
  giftImageUrl?: string;
  animationUrl?: string;
  animationFormat?: string | null;
  animationConfigUrl?: string;
  soundUrl?: string;
  giftColor: string;
  count: number;
  coins: number;
}

// ============= ROOM CONTEXT TYPES =============
export type RoomType = 'live' | 'party_audio' | 'party_video' | 'party_game';

export interface RoomParticipant {
  id: string;
  oderId: string;
  displayName: string;
  avatarUrl?: string;
  userLevel: number;
  isHost?: boolean;
  isOnSeat?: boolean;
  seatPosition?: number;
}

// ============= HOOK RETURN TYPES =============
export interface UseJoinNotificationsReturn {
  notifications: JoinNotification[];
  addNotification: (notification: Omit<JoinNotification, 'id' | 'timestamp'>) => void;
  clearAll: () => void;
}

export interface UseFlyingJoinBannerReturn {
  activeNotification: JoinNotification | null;
  addNotification: (notification: Omit<JoinNotification, 'id' | 'timestamp'>) => void;
  completeNotification: () => void;
  clearAll: () => void;
  queueLength: number;
}
