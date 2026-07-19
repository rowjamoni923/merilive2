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

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import TraderBadge from "@/components/common/TraderBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { RoomWelcomeBanner } from "@/components/room/RoomWelcomeBanner";
import { MessageBubbleWrapper } from "@/components/chat/MessageBubbleWrapper";
import { ScrollToBottomButton } from "@/components/chat/ScrollToBottomButton";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";

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
import { getDisplayAvatar } from "@/utils/placeholderAvatar";
import { normalizeGiftMediaUrl } from "@/utils/giftMediaUrl";

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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "flex items-center gap-1 py-0.5 px-2 rounded-lg w-fit max-w-[92%]",
        "bg-amber-500/20 backdrop-blur-sm border border-amber-300/20"
      )}
    >
      <span className="text-[10px] shrink-0 opacity-80">👋</span>
      <span className="text-[10px] text-amber-50/90 font-normal drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-tight truncate">
        Welcome to {hostName}'s {roomType === 'audio' ? 'Audio Party' : roomType === 'video' ? 'Video Party' : roomType === 'game' ? 'Game Party' : 'Live Stream'}
        {roomTitle && ` — ${roomTitle}`}
        <span className="ml-1 text-amber-200 font-semibold">
          {formatLevel(level)}
        </span>
      </span>
    </motion.div>
  );
});

WelcomeMessage.displayName = 'WelcomeMessage';

// ============= SINGLE JOIN NOTIFICATION (Bigo/Chamet Professional Style) =============
interface JoinNotificationItemProps {
  notification: JoinNotification;
  /** Room context to render proper welcome wording (live vs party). */
  roomKind?: 'live' | 'party';
}

const JoinNotificationItem = memo(({ notification, roomKind = 'live' }: JoinNotificationItemProps) => {
  const level = ensureValidLevel(notification.userLevel);
  const welcomeText = roomKind === 'party' ? 'entered the party room' : 'entered the live room';

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
        <Avatar className="w-7 h-7 md:w-9 md:h-9 relative border-2 border-white/80">
          <AvatarImage 
            src={notification.userAvatar || getDisplayAvatar(notification.userName)}
            alt={notification.userName}
          />
          <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs md:text-sm font-bold">
            {notification.userName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Level Badge - Premium style with glow */}
      <div className={cn(
        "px-2.5 py-0.5 rounded-lg text-[10px] md:text-xs font-black flex items-center gap-0.5",
        getLevelBadgeBg(level),
        getLevelTextColor(level)
      )}>
        <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{formatLevel(level)}</span>
      </div>

      {/* Username - Premium with glow */}
      <span className="text-white font-bold text-xs md:text-sm truncate max-w-[120px] md:max-w-[160px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {notification.userName}
      </span>

      {/* Welcome wording — Chamet/BIGO standard */}
      <div className="flex items-center gap-1 text-white/95">
        <span className="text-[10px] md:text-xs font-medium italic whitespace-nowrap">
          {welcomeText}
        </span>
        <motion.span
          className="text-sm md:text-base"
          animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 0.6, repeat: 2 }}
        >
          ✨
        </motion.span>
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
  const giftIconUrl = normalizeGiftMediaUrl(giftIconMatch?.[1]);
  // Clean message text - remove the [GIFT:url] prefix
  let cleanMessage = message.message.replace(/\[GIFT:[^\]]*\]\s*/, '');
  
  // Parse game win message - supports v1/v2/v3 formats
  // v1: [GAME_WIN:emoji:gameName:amount]
  // v2: [GAME_WIN:emoji:gameName:amount:userName:level]
  // v3: [GAME_WIN:emoji:gameName:amount:userName:level:userId:avatarUrl]
  const gameWinMatchV3 = message.message.match(/^\[GAME_WIN:([^:]+):([^:]+):([^:]+):([^:]+):(\d+):([0-9a-fA-F-]+):([^\]]*)\]$/);
  const gameWinMatchNew = !gameWinMatchV3 ? message.message.match(/^\[GAME_WIN:([^:]+):([^:]+):([^:]+):([^:]+):(\d+)\]$/) : null;
  const gameWinMatchOld = (!gameWinMatchV3 && !gameWinMatchNew) ? message.message.match(/^\[GAME_WIN:([^:]+):([^:]+):([^:]+)\]$/) : null;
  const isGameWinMessage = !!gameWinMatchV3 || !!gameWinMatchNew || !!gameWinMatchOld;

  const gameWinData = gameWinMatchV3 ? {
    emoji: gameWinMatchV3[1],
    gameName: gameWinMatchV3[2],
    gameKey: gameWinMatchV3[2].toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_'),
    amount: gameWinMatchV3[3],
    userName: gameWinMatchV3[4],
    userLevel: parseInt(gameWinMatchV3[5]),
    userId: gameWinMatchV3[6],
    avatarUrl: gameWinMatchV3[7] || undefined,
  } : gameWinMatchNew ? {
  } : gameWinMatchOld ? {
  } : null;

  // Get game logo from Admin Panel (game_settings table)
  const gameLogoUrl = gameWinData ? getGameLogoUrl(gameWinData.gameKey) : null;
  const gameFallbackEmoji = gameWinData ? getGameEmoji(gameWinData.gameKey) : '🎮';

  // Clean message for game win - show user info ("Won 5K in Roulette!")
  if (isGameWinMessage && gameWinData) {
    cleanMessage = `won ${gameWinData.amount} 💎 in ${gameWinData.gameName}!`;
  }
  
  const isGiftMessage = message.message.includes('[GIFT:') || message.message.toLowerCase().includes('sent ');
  const isJoinMessage = message.type === 'join' || cleanMessage.includes('entered') || cleanMessage.includes('joined');
  const isSystemMessage = message.user === 'System' || message.type === 'system';
  const isHost = message.isHost || false;
  const isNewUser = message.isNewUser || false;

  // Gift messages in chat should NOT auto-hide - they stay permanently visible
  // Only the flying gift animation banner (FlyingGiftAnimation) vanishes quickly
  // The chat gift messages (like "sent Gift x1") should remain in chat history

  // Pro-app style: subtle, tight, dark translucent pill (Bigo/Chamet/Olamet).
  // No heavy gradients, no glowing rings — chat row hugs content and stays low-key
  // so the video/seats stay the visual focus.
  const getBgStyle = () => {
    if (isGameWinMessage) return "from-amber-500/25 via-yellow-500/20 to-orange-500/15";
    if (isHost) return "from-rose-500/22 via-pink-500/18 to-red-500/14";
    if (isGiftMessage) return "from-pink-500/20 via-rose-500/16 to-fuchsia-500/12";
    if (isJoinMessage) return "from-emerald-500/18 via-green-500/14 to-teal-500/10";
    if (isSystemMessage) return "from-amber-500/18 via-yellow-500/14 to-orange-500/10";
    return "from-black/45 via-black/35 to-black/30";
  };

  const getBorderStyle = () => {
    if (isGameWinMessage) return "border-yellow-300/35";
    if (isHost) return "border-rose-300/30";
    if (isGiftMessage) return "border-pink-300/25";
    if (isJoinMessage) return "border-emerald-300/25";
    if (isSystemMessage) return "border-amber-300/25";
    return "border-white/10";
  };

  const getGlowStyle = () => {
    if (isGameWinMessage) return "shadow-[0_1px_8px_rgba(251,191,36,0.18)]";
    if (isHost) return "shadow-[0_1px_8px_rgba(244,63,94,0.18)]";
    if (isGiftMessage) return "shadow-[0_1px_8px_rgba(236,72,153,0.15)]";
    if (isJoinMessage) return "";
    return "shadow-[0_1px_4px_rgba(0,0,0,0.35)]";
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
        // Chamet-style mini for join messages — ultra compact, no gradient
        isJoinMessage && !hasDesignerBubble && [
          "rounded-full max-w-[80%] py-[2px] px-2 gap-1",
          "bg-black/40 backdrop-blur-md border border-white/10",
        ],
        // Default pill styling for non-join, non-designer bubble messages
        !hasDesignerBubble && !isJoinMessage && [
          "rounded-full max-w-[94%] md:max-w-[72%]",
          "bg-gradient-to-r backdrop-blur-md",
          getBgStyle(),
          "border",
          getBorderStyle(),
          getGlowStyle(),
          isGiftMessage ? "py-1 px-2.5" : "py-1 px-3",
        ],
      )}
    >
      {/* Pro-app style: NO inline avatar in normal chat row (Bigo/Chamet/Olamet pattern).
          Identity is conveyed by Level badge + colored username.
          EXCEPTION: Game-win messages render the winner's avatar + equipped frame,
          matching the entry/welcome banner style the user explicitly requested. */}
      {isGameWinMessage && gameWinData && (
        <div className="shrink-0">
          <AvatarWithFrame
            userId={gameWinData.userId}
            src={gameWinData.avatarUrl || getDisplayAvatar(gameWinData.userName)}
            name={gameWinData.userName}
            level={ensureValidLevel(gameWinData.userLevel)}
            size="xs"
            showFrame={true}
            showAnimation={ensureValidLevel(gameWinData.userLevel) >= 10}
          />
        </div>
      )}




      {/* HOST Badge */}
      {isHost && !isGiftMessage && (
        <div className="px-2 py-0.5 rounded-md text-[9px] font-black bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-md shrink-0 border border-white/30 tracking-wide">
          HOST
        </div>
      )}

      {/* NEW Badge */}
      {isNewUser && !isHost && !isGiftMessage && (
        <div className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-sm shrink-0 animate-pulse">
          🆕 NEW
        </div>
      )}

      {/* Level Badge — hidden for Chamet-mini join rows */}
      {!isJoinMessage && (
        <div className={cn(
          "rounded-md font-black shrink-0 shadow-md",
          getLevelBadgeBg(level),
          getLevelTextColor(level),
          isGiftMessage ? "px-1.5 py-0.5 text-[8px] md:text-[10px]" : "px-2 py-0.5 text-[10px] md:text-xs"
        )}>
          <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{formatLevel(level)}</span>
        </div>
      )}

      {/* Country Flag */}
      {message.countryFlag && !isGiftMessage && !isJoinMessage && (
        <span className="text-sm md:text-base shrink-0 drop-shadow-md">{message.countryFlag}</span>
      )}

      {/* Username + Colon */}
      <span className={cn(
        "font-semibold shrink-0 tracking-tight",
        isHost ? 'text-rose-100' : isGiftMessage ? 'text-pink-100' : isJoinMessage ? 'text-white/90' : 'text-cyan-100',
        !isJoinMessage && "drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]",
        isHost && "text-shadow-glow-rose",
        isGameWinMessage && "text-shadow-glow-amber",
        isJoinMessage
          ? "text-[10px] font-medium truncate max-w-[120px]"
          : isGiftMessage
            ? "text-[10.5px] md:text-xs font-bold"
            : "text-[12.5px] md:text-[14px] font-bold"
      )}>
        {isGameWinMessage && gameWinData ? gameWinData.userName : `${message.user}${isJoinMessage ? '' : ':'}`}
      </span>

      {/* Trader Badge — hidden for Chamet-mini join rows */}
      {message.isTrader && !isJoinMessage && <TraderBadge level={message.traderLevel || 1} size="xs" />}

      {/* Message Text */}
      <span className={cn(
        "break-words leading-snug",
        !isJoinMessage && "font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]",
        isGameWinMessage ? 'text-yellow-50 font-bold' : isGiftMessage ? 'text-pink-50' : isJoinMessage ? 'text-white/60' : 'text-white/95',
        isJoinMessage
          ? "text-[10px]"
          : isGiftMessage
            ? "text-[10.5px] md:text-xs"
            : "text-[12.5px] md:text-[14px]"
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
              <img loading="lazy" decoding="async" 
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
          <img loading="lazy" decoding="async" 
            src={giftIconUrl} 
            alt="Gift" 
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </motion.div>
      )}
      
      {/* Join sparkle removed for Chamet-style mini row */}
    </motion.div>
  );

  if (hasDesignerBubble) {
    return (
      <MessageBubbleWrapper
        bubbleUrl={message.bubbleUrl}
        safeAreaClassName="px-4 py-2"
        maxWidthClassName="max-w-[92%]"
      >
        {innerContent}
      </MessageBubbleWrapper>
    );
  }

  return innerContent;
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
  // Show all messages or limit if maxMessages is provided
  const displayLimit = maxMessages ?? 40;
  const displayMessages = messages.slice(-Math.min(displayLimit, 40));
  const roomChatScroll = useStableChatScroll({
    dependency: `${displayMessages.length}:${joinNotifications.length}:${adminBannerRoomType || ''}`,
    resetKey: roomTitle || hostName || roomType || null,
    reverse: true,
    bottomThreshold: 72,
    initialPinFrames: 4,
  });

  // With flex-col-reverse, scroll position 0 is at bottom (newest)
  // No auto-scroll needed - newest messages naturally appear at bottom

  return (
    <div className={cn(
      "flex flex-col relative gap-1.5 w-[68vw] max-w-[520px] min-w-0",
      className
    )}>
      {/* SCROLLABLE CHAT CONTAINER — admin warning + join + messages.
          flex-col-reverse: first DOM child = visually bottom (newest).
          Warning is the LAST DOM child → renders at the TOP of the stream
          (oldest), and as new joins/messages arrive it naturally scrolls
          upward out of view — Bigo/Chamet/Olamet behaviour. */}
      <div
        ref={roomChatScroll.scrollRef}
        className={cn(
          "flex flex-col-reverse gap-2 overflow-y-auto overflow-x-hidden",
          "scrollbar-thin scrollbar-thumb-white/25 scrollbar-track-transparent",
          "chat-scroll-stable",
          "pr-1 pl-0.5 py-1 rounded-2xl",
          "bg-gradient-to-t from-black/25 via-black/5 to-transparent",
          "backdrop-blur-[3px]"
        )}
        style={{ maxHeight: `min(${maxHeight}, 400px)` }}
      >
        {/* Chat messages — first DOM child = visually at the bottom */}
        <AnimatePresence initial={false} mode="popLayout">
          {displayMessages.slice().reverse().map((msg) => (
            <ChatMessageItem
              key={msg.id}
              message={msg}
              autoHide={msg.message.includes('[GIFT:') || msg.message.toLowerCase().includes('sent ')}
            />
          ))}
        </AnimatePresence>

        {/* Join Notifications — appear above messages */}
        <AnimatePresence initial={false} mode="popLayout">
          {joinNotifications.slice().reverse().map((notification) => (
            <JoinNotificationItem
              key={notification.id}
              notification={notification}
              roomKind={roomType === 'live' ? 'live' : 'party'}
            />
          ))}
        </AnimatePresence>

        {/* Admin rule warning — LAST DOM child → visually at the TOP of
            the chat stream. New joins/messages render below and push the
            warning upward as the stream fills. */}
        {adminBannerRoomType && (
          <RoomWelcomeBanner roomType={adminBannerRoomType} />
        )}
      </div>


      {/* Scroll-to-bottom button — appears when user scrolls up */}
      <ScrollToBottomButton
        scrollRef={roomChatScroll.scrollRef}
        reverse
        className="bottom-2 left-1/2 -translate-x-1/2"
      />

    </div>
  );
});
RoomChatOverlay.displayName = 'RoomChatOverlay';

// ============= EXPORTS =============
export { JoinNotificationItem, ChatMessageItem };
export default RoomChatOverlay;
