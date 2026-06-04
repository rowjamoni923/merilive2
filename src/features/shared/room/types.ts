export interface JoinNotification {
  id: string;
  userName: string;
  userAvatar?: string;
  userLevel: number;
}

export interface RoomChatMessage {
  id: string;
  user: string;
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
}
