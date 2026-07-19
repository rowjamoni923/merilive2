/**
 * =====================================================
 * UNIFIED MESSAGING SYSTEM
 * =====================================================
 * 
 * Single source for ALL chat/messaging across the app.
 * Change here = Change everywhere (Live Chat, Party Chat, Direct Messages)
 * 
 * ONE LINK = ONE UPDATE = ALL SECTIONS UPDATED
 * - Live Stream Chat
 * - Party Room Chat  
 * - Direct Messages (Chat Page)
 * 
 * Usage: import { PremiumJoinChatOverlay, EmojiPicker } from '@/features/shared/messaging';
 * =====================================================
 */

// ========== MAIN CHAT OVERLAY (Used in Live & Party) ==========
// This is THE SINGLE LINK for all room chat displays
export { 
  PremiumJoinChatOverlay,
  type JoinNotification as ChatJoinNotification,
  type ChatMessage as OverlayChatMessage 
} from '@/components/live/PremiumJoinChatOverlay';

// ========== CHAT UTILITIES ==========
export { EmojiPicker } from '@/components/chat/EmojiPicker';
export { MediaUploader } from '@/components/chat/MediaUploader';

// ========== CHAT MESSAGE COMPONENTS ==========
export { ProfessionalChatMessage } from '@/components/live/ProfessionalChatMessage';

// ========== PARTY CHAT PANEL ==========
export { ChametStyleChatPanel } from '@/components/party/ChametStyleChatPanel';

// ========== UNIFIED ROOM CHAT (From Room System) ==========
export { RoomChatOverlay } from '@/features/shared/room/RoomChatOverlay';

// ========== TYPES ==========
export interface UnifiedChatMessage {
  id: string;
  oderId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userLevel?: number;
  content: string;
  type: 'text' | 'gift' | 'system' | 'sticker' | 'join';
  timestamp: Date;
  isHost?: boolean;
  isNewUser?: boolean;
  countryFlag?: string;
  giftData?: {
    giftId: string;
    giftName: string;
    giftIcon: string;
    count: number;
    diamonds: number;
  };
}

export interface ChatConfig {
  maxMessages: number;
  enableGifts: boolean;
  enableStickers: boolean;
  enableEmoji: boolean;
  showLevelBadges: boolean;
  showVIPBadges: boolean;
  enableScrolling: boolean;
}

// Default config used across all chat instances
export const defaultChatConfig: ChatConfig = {
  maxMessages: 500, // Increased - no limit on scrolling
  enableGifts: true,
  enableStickers: true,
  enableEmoji: true,
  showLevelBadges: true,
  showVIPBadges: true,
  enableScrolling: true,
};
