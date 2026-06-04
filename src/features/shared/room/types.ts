export interface JoinNotification {
  id: string;
  userName: string;
  userId?: string;
  userAvatar?: string;
  userLevel: number;
  timestamp: number;
}

export interface RoomChatMessage {
  id: string;
  user: string;
  userId?: string;
  userAvatar?: string;
  userLevel: number;
  message: string;
  initial: string;
  isHost?: boolean;
  isNewUser?: boolean;
  isVIP?: boolean;
  vipTier?: number;
  isTrader?: boolean;
  traderLevel?: number;
  bubbleUrl?: string;
  countryFlag?: string;
  type?: 'message' | 'gift' | 'join' | 'system' | 'leave';
  giftImageUrl?: string;
  color?: string;
}

export interface FlyingGiftData {
  id: string;
  senderName: string;
  giftName: string;
  giftIcon: string;
  giftImageUrl?: string;
  animationUrl?: string;
  animationFormat?: string | null;
  animationConfigUrl?: string | null;
  soundUrl?: string;
  giftColor: string;
  count: number;
  coins: number;
}

export type RoomType = 'live' | 'party' | 'audio' | 'video' | 'game';

export interface RoomParticipant {
  userId: string;
  userName: string;
  userAvatar?: string;
  userLevel: number;
  isHost?: boolean;
  isMuted?: boolean;
  isSpeaking?: boolean;
}

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
