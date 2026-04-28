/**
 * =====================================================
 * UNIFIED ROOM CHAT OVERLAY (Bigo/Chamet/Popo Style)
 * =====================================================
 * 
 * ONE LINK = ONE CHANGE = BOTH PARTY ROOM & LIVE STREAM UPDATED
 * 
 * Premium chat overlay with:
 * - Welcome message when host starts room (with room description)
 * - Join notifications (Bigo-style with level, avatar, sparkle)
 * - Chat messages with level badges
 * - Gift notifications with gift icons
 * - System announcements
 * - SCROLLABLE: All messages visible by scrolling
 * 
 * =====================================================
 */

import React, { memo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import TraderBadge from "@/components/common/TraderBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RoomWelcomeBanner } from "@/components/room/RoomWelcomeBanner";
import { MessageBubbleWrapper } from "@/components/chat/MessageBubbleWrapper";

import { 
  getLevelGradient, 
  getLevelBadgeBg, 
  getLevelTextColor, 
  getJoinBannerBg,
  ensureValidLevel,
  formatLevel 
} from "@/features/shared/level";
import { JoinNotification, RoomChatMessage } from './types';
import { getGameLogoUrl, getGameEmoji } from '@/hooks/useGameLogos';

// ============= WELCOME MESSAGE COMPONENT (Ultra Premium Luxury Style) =============
interface WelcomeMessageProps {
  hostName: string;
  hostLevel?: number;
  roomTitle?: string;
  roomType?: 'live' | 'party' | 'audio' | 'video' | 'game';
}

export const WelcomeMessage = memo(({ 
  hostName, 
  hostLevel = 1, 
  roomTitle,
  roomType = 'live' 
}: WelcomeMessageProps) => {
  const level = ensureValidLevel(hostLevel);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "flex items-start gap-2 py-2 px-3.5 rounded-2xl w-full",
        "bg-gradient-to-r from-amber-500/30 via-yellow-400/25 to-orange-400/20",
        "backdrop-blur-md border border-amber-300/30",
        "shadow-[0_2px_15px_rgba(251,191,36,0.2),0_0_30px_rgba(251,191,36,0.08)]",
        "ring-1 ring-amber-400/15"
      )}
    >
      {/* Emoji with glow */}
      <motion.span 
        className="text-sm shrink-0 mt-0.5 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
        animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        👋
      </motion.span>
      
      {/* Welcome text - Premium styling */}
      <span className="text-[10px] text-amber-50/95 font-medium drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] leading-relaxed">
        Welcome to {hostName}'s {roomType === 'audio' ? 'Audio Party' : roomType === 'video' ? 'Video Party' : roomType === 'game' ? 'Game Party' : 'Live Stream'}! 
        {roomTitle && ` — ${roomTitle}`} 
        <span className="ml-1.5 text-amber-200 font-bold bg-amber-500/20 px-1.5 py-0.5 rounded-md">
          Lv.{formatLevel(level)}
        </span>
      </span>
    </motion.div>
  );
});

WelcomeMessage.displayName = 'WelcomeMessage';

// ============= SINGLE JOIN NOTIFICATION (Bigo/Chamet Professional Style) =============
interface JoinNotificationItemProps {
  notification: JoinNotification;
}

const JoinNotificationItem = memo(({ notification }: JoinNotificationItemProps) => {
  const level = ensureValidLevel(notification.userLevel);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -150 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100, transition: { duration: 0.15 } }}
      transition={{ type: "spring", damping: 24, stiffness: 300 }}
      className={cn(
        "flex items-center gap-2 py-2 pl-2 pr-4 rounded-r-full rounded-l-2xl w-fit",
        "bg-gradient-to-r",
        getJoinBannerBg(level),
        "backdrop-blur-xl",
        "border-l-4 border-l-white/50"
      )}
    >
      {/* Avatar with glow */}
      <div className="relative">
        <div className={cn(
          "absolute -inset-0.5 rounded-full bg-gradient-to-r animate-pulse opacity-60",
          getLevelGradient(level)
        )} />
        <Avatar className="w-7 h-7 relative border-2 border-white/80">
          <AvatarImage 
            src={notification.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${notification.userName}`}
            alt={notification.userName}
          />
          <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-bold">
            {notification.userName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Level Badge - Premium style with glow */}
      <div className={cn(
        "px-2.5 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-0.5",
        getLevelBadgeBg(level),
        getLevelTextColor(level)
      )}>
        <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{formatLevel(level)}</span>
      </div>

      {/* Username - Premium with glow */}
      <span className="text-white font-bold text-xs truncate max-w-[100px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {notification.userName}
      </span>

      {/* Sparkle + "joined the room" */}
      <div className="flex items-center gap-0.5 text-white/95">
        <motion.span 
          className="text-sm"
          animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 0.6, repeat: 2 }}
        >
          ✨
        </motion.span>
        <span className="text-[10px] font-medium italic">joined</span>
      </div>
    </motion.div>
  );
});

JoinNotificationItem.displayName = 'JoinNotificationItem';

// ============= MENTION PARSER - Parse @username mentions =============
const parseMentions = (text: string): React.ReactNode[] => {
  const mentionRegex = /@(\w+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add styled mention
    parts.push(
      <span 
        key={`mention-${match.index}`}
        className="text-cyan-300 font-bold bg-cyan-500/20 px-1 rounded hover:bg-cyan-500/30 cursor-pointer transition-colors"
      >
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

// ============= SINGLE CHAT MESSAGE (Ultra Premium Luxury Style) =============
interface ChatMessageItemProps {
  message: RoomChatMessage;
  autoHide?: boolean; // For gift messages - auto-hide after 1 second
  onAutoHide?: (id: string) => void;
}

const ChatMessageItem = memo(({ message, autoHide, onAutoHide }: ChatMessageItemProps) => {
  const level = ensureValidLevel(message.userLevel);
  const [isVisible, setIsVisible] = React.useState(true);
  
  // Extract gift icon URL from message format: [GIFT:url] sent GiftName x count
  const giftIconMatch = message.message.match(/\[GIFT:([^\]]*)\]/);
  const giftIconUrl = giftIconMatch ? giftIconMatch[1] : null;
  // Clean message text - remove the [GIFT:url] prefix
  let cleanMessage = message.message.replace(/\[GIFT:[^\]]*\]\s*/, '');
  
  // Parse game win message - supports both old and new formats
  // Old: [GAME_WIN:emoji:gameName:amount]
  // New: [GAME_WIN:emoji:gameName:amount:userName:level]
  const gameWinMatchNew = message.message.match(/^\[GAME_WIN:(.+?):(.+?):(.+?):(.+?):(\d+)\]$/);
  const gameWinMatchOld = message.message.match(/^\[GAME_WIN:(.+?):(.+?):(.+?)\]$/);
  const isGameWinMessage = !!gameWinMatchNew || !!gameWinMatchOld;
  
  const gameWinData = gameWinMatchNew ? {
    emoji: gameWinMatchNew[1],
    gameName: gameWinMatchNew[2],
    gameKey: gameWinMatchNew[2].toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_'),
    amount: gameWinMatchNew[3],
    userName: gameWinMatchNew[4],
    userLevel: parseInt(gameWinMatchNew[5])
  } : gameWinMatchOld ? {
    emoji: gameWinMatchOld[1],
    gameName: gameWinMatchOld[2],
    gameKey: gameWinMatchOld[2].toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_'),
    amount: gameWinMatchOld[3],
    userName: message.user,
    userLevel: message.userLevel || 1
  } : null;
  
  // Get game logo from Admin Panel (game_settings table)
  const gameLogoUrl = gameWinData ? getGameLogoUrl(gameWinData.gameKey) : null;
  const gameFallbackEmoji = gameWinData ? getGameEmoji(gameWinData.gameKey) : '🎮';
  
  // Clean message for game win - show user info
  if (isGameWinMessage && gameWinData) {
    cleanMessage = `🏆 ${gameWinData.userName} (Lv.${gameWinData.userLevel}) won ${gameWinData.amount} in ${gameWinData.gameName}!`;
  }
  
  const isGiftMessage = message.message.includes('[GIFT:') || message.message.toLowerCase().includes('sent ');
  const isJoinMessage = message.type === 'join' || cleanMessage.includes('entered') || cleanMessage.includes('joined');
  const isSystemMessage = message.user === 'System' || message.type === 'system';
  const isHost = message.isHost || false;
  const isNewUser = message.isNewUser || false;

  // Gift messages in chat should NOT auto-hide - they stay permanently visible
  // Only the flying gift animation banner (FlyingGiftAnimation) vanishes quickly
  // The chat gift messages (like "sent Gift x1") should remain in chat history

  // Ultra Premium Background Styles with enhanced glassmorphism
  const getBgStyle = () => {
    if (isGameWinMessage) return "from-amber-500/35 via-yellow-400/30 to-orange-500/25";
    if (isHost) return "from-rose-500/35 via-pink-500/30 to-red-500/25";
    if (isGiftMessage) return "from-pink-500/30 via-rose-400/25 to-fuchsia-500/20";
    if (isJoinMessage) return "from-emerald-500/25 via-green-400/20 to-teal-500/15";
    if (isSystemMessage) return "from-amber-500/25 via-yellow-400/20 to-orange-500/15";
    return "from-slate-800/40 via-slate-700/35 to-slate-900/30";
  };

  // Premium border with subtle glow
  const getBorderStyle = () => {
    if (isGameWinMessage) return "border-yellow-300/60 ring-1 ring-yellow-400/20";
    if (isHost) return "border-rose-300/50 ring-1 ring-rose-400/15";
    if (isGiftMessage) return "border-pink-300/45 ring-1 ring-pink-400/15";
    if (isJoinMessage) return "border-emerald-300/40 ring-1 ring-emerald-400/10";
    if (isSystemMessage) return "border-amber-300/40 ring-1 ring-amber-400/10";
    return "border-white/15 ring-1 ring-white/5";
  };
  
  // Enhanced luxury glow effects
  const getGlowStyle = () => {
    if (isGameWinMessage) return "shadow-[0_2px_20px_rgba(251,191,36,0.35),0_0_40px_rgba(251,191,36,0.15)]";
    if (isHost) return "shadow-[0_2px_16px_rgba(244,63,94,0.3),0_0_30px_rgba(244,63,94,0.1)]";
    if (isGiftMessage) return "shadow-[0_2px_14px_rgba(236,72,153,0.25),0_0_25px_rgba(236,72,153,0.1)]";
    if (isJoinMessage) return "";
    return "shadow-[0_2px_10px_rgba(0,0,0,0.3)]";
  };

  if (!isVisible) return null;

  // ===== DESIGNER SVGA BUBBLE WRAPPER =====
  // If sender has an equipped chat bubble (VIP / Noble / Shop), the SVGA bubble itself
  // becomes the message background — text sits inside the designed safe area.
  // We skip the gradient/border/glow styling so the bubble art is fully visible.
  const hasDesignerBubble = !!message.bubbleUrl && !isSystemMessage && !isJoinMessage;

  const innerContent = (
    <motion.div
      initial={{ opacity: 0, x: -80 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60, transition: { duration: 0.15 } }}
      transition={{ type: "spring", damping: 28, stiffness: 350 }}
      className={cn(
        "flex flex-wrap items-center gap-1.5 w-fit",
        // Only apply default gradient bubble styling when there's NO designer bubble
        !hasDesignerBubble && [
          "rounded-2xl max-w-[92%]",
          "bg-gradient-to-r backdrop-blur-md",
          getBgStyle(),
          "border",
          getBorderStyle(),
          getGlowStyle(),
          isGiftMessage ? "py-1 px-2.5" : "py-1.5 px-3.5",
        ],
      )}
    >
      {/* Mini Avatar - smaller for gift messages */}
      {message.userAvatar && (
        <Avatar className={cn(
          "border border-white/40 shrink-0",
          isGiftMessage ? "w-4 h-4" : "w-5 h-5"
        )}>
          <AvatarImage src={message.userAvatar} alt={message.user} />
          <AvatarFallback className="bg-violet-500 text-white text-[6px] font-bold">
            {message.initial}
          </AvatarFallback>
        </Avatar>
      )}

      {/* HOST Badge - smaller for gift */}
      {isHost && !isGiftMessage && (
        <div className="px-1.5 py-0.5 rounded text-[8px] font-black bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-md shrink-0 border border-white/30">
          Host
        </div>
      )}

      {/* NEW Badge */}
      {isNewUser && !isHost && !isGiftMessage && (
        <div className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-sm shrink-0 animate-pulse">
          🆕 NEW
        </div>
      )}

      {/* Level Badge - smaller for gift messages */}
      <div className={cn(
        "rounded-md font-black shrink-0 shadow-md",
        getLevelBadgeBg(level),
        getLevelTextColor(level),
        isGiftMessage ? "px-1 py-0 text-[7px]" : "px-1.5 py-0.5 text-[9px]"
      )}>
        <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{formatLevel(level)}</span>
      </div>

      {/* Country Flag */}
      {message.countryFlag && !isGiftMessage && (
        <span className="text-xs shrink-0 drop-shadow-md">{message.countryFlag}</span>
      )}

      {/* Username + Colon - smaller for gift messages */}
      <span className={cn(
        "font-bold shrink-0",
        isHost ? 'text-rose-100' : isGiftMessage ? 'text-pink-100' : isJoinMessage ? 'text-emerald-100' : 'text-cyan-100',
        "drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]",
        isHost && "text-shadow-glow-rose",
        isGameWinMessage && "text-shadow-glow-amber",
        isGiftMessage ? "text-[9px]" : "text-[11px]"
      )}>
        {message.user}:
      </span>

      {/* Trader Badge */}
      {message.isTrader && <TraderBadge level={message.traderLevel || 1} size="xs" />}

      {/* Message Text with @mention support - smaller for gift messages */}
      <span className={cn(
        "break-words font-medium",
        "drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]",
        isGameWinMessage ? 'text-yellow-50 font-bold' : isGiftMessage ? 'text-pink-50' : 'text-white/95',
        isGiftMessage ? "text-[9px]" : "text-[11px]"
      )}>
        {parseMentions(cleanMessage)}
      </span>

      {/* Game Win - Show Logo from Admin Panel or Fallback Emoji */}
      {isGameWinMessage && gameWinData && (
        <>
          {/* Game Logo from Admin Panel */}
          {gameLogoUrl ? (
            <motion.div 
              className="w-7 h-7 shrink-0 rounded-lg overflow-hidden bg-white/20 shadow-lg border border-yellow-400/50"
              animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
              transition={{ duration: 0.6, repeat: 3 }}
            >
              <img 
                src={gameLogoUrl} 
                alt={gameWinData.gameName} 
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </motion.div>
          ) : (
            <motion.span 
              className="text-lg shrink-0"
              animate={{ scale: [1, 1.3, 1], rotate: [0, 15, -15, 0] }}
              transition={{ duration: 0.6, repeat: 3 }}
            >
              {gameFallbackEmoji}
            </motion.span>
          )}
          <motion.span 
            className="text-sm shrink-0"
            animate={{ scale: [1, 1.4, 1], y: [0, -3, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            💎
          </motion.span>
        </>
      )}

      {/* Gift Image - smaller for quick notification */}
      {isGiftMessage && giftIconUrl && (
        <motion.div 
          className="w-4 h-4 shrink-0 rounded overflow-hidden bg-white/10 shadow-md"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 0.4, repeat: 1 }}
        >
          <img 
            src={giftIconUrl} 
            alt="Gift" 
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </motion.div>
      )}
      
      {/* Join sparkle */}
      {isJoinMessage && (
        <motion.span 
          className="text-sm shrink-0"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 0.5, repeat: 2 }}
        >
          ✨
        </motion.span>
      )}
    </motion.div>
  );
});

ChatMessageItem.displayName = 'ChatMessageItem';

// ============= MAIN CONTAINER COMPONENT =============
interface RoomChatOverlayProps {
  messages: RoomChatMessage[];
  joinNotifications: JoinNotification[];
  maxMessages?: number; // Optional - if not set, shows ALL messages
  maxHeight?: string; // Customizable max height for scrolling
  className?: string;
  // NEW: Welcome message props (Bigo/Chamet style)
  showWelcome?: boolean;
  hostName?: string;
  hostLevel?: number;
  roomTitle?: string;
  roomType?: 'live' | 'party' | 'audio' | 'video' | 'game';
  // Admin Room Warning Banner (permanent, compact)
  adminBannerRoomType?: 'live' | 'party_audio' | 'party_video' | 'party_game';
}

export const RoomChatOverlay = memo(({
  messages,
  joinNotifications,
  maxMessages, // No default limit - shows ALL messages
  maxHeight = "180px",
  className,
  showWelcome = false,
  hostName,
  hostLevel,
  roomTitle,
  roomType,
  adminBannerRoomType,
}: RoomChatOverlayProps) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Show all messages or limit if maxMessages is provided
  const displayMessages = maxMessages ? messages.slice(-maxMessages) : messages;
  
  // With flex-col-reverse, scroll position 0 is at bottom (newest)
  // No auto-scroll needed - newest messages naturally appear at bottom
  
  return (
    <div className={cn(
      "flex flex-col w-full",
      className
    )}>
      {/* SCROLLABLE CHAT CONTAINER - Ultra Premium Luxury Style */}
      {/* flex-col-reverse: newest at bottom, scroll up to see older messages */}
      {/* ALL content (banner, welcome, messages) scrolls together */}
      {/* Subtle blur background for premium look */}
      <div 
        ref={chatContainerRef}
        className={cn(
          "flex flex-col-reverse gap-1.5 overflow-y-auto overflow-x-hidden",
          "scrollbar-thin scrollbar-thumb-white/25 scrollbar-track-transparent",
          "pr-1 rounded-2xl",
          "bg-gradient-to-t from-black/20 via-transparent to-transparent",
          "backdrop-blur-[2px]"
        )}
        style={{ maxHeight }}
      >
        {/* REVERSED ORDER: Chat messages first (will appear at bottom) */}
        <AnimatePresence initial={false} mode="sync">
          {displayMessages.slice().reverse().map((msg) => (
            <ChatMessageItem 
              key={msg.id} 
              message={msg} 
              autoHide={msg.message.includes('[GIFT:') || msg.message.toLowerCase().includes('sent ')}
            />
          ))}
        </AnimatePresence>
        
        {/* Join Notifications - After messages in reverse (appear above messages) */}
        <AnimatePresence initial={false} mode="sync">
          {joinNotifications.slice().reverse().map((notification) => (
            <JoinNotificationItem key={notification.id} notification={notification} />
          ))}
        </AnimatePresence>
        
        {/* Welcome Message - INSIDE scroll, will scroll up with messages */}
        {showWelcome && hostName && (
          <div className="shrink-0">
            <WelcomeMessage 
              hostName={hostName}
              hostLevel={hostLevel}
              roomTitle={roomTitle}
              roomType={roomType}
            />
          </div>
        )}
        
        {/* Admin Room Warning Banner - INSIDE scroll, at very top when scrolled up */}
        {adminBannerRoomType && (
          <div className="shrink-0">
            <RoomWelcomeBanner roomType={adminBannerRoomType} />
          </div>
        )}
      </div>
    </div>
  );
});

RoomChatOverlay.displayName = 'RoomChatOverlay';

// ============= EXPORTS =============
export { JoinNotificationItem, ChatMessageItem };
export default RoomChatOverlay;
