import React, { memo, useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import TraderBadge from "@/components/common/TraderBadge";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";
import { 
  getLevelGradient, 
  getLevelBadgeBg, 
  getLevelTextColor, 
  getJoinBannerBg,
  ensureValidLevel,
  formatLevel 
} from "@/features/shared/level";
import { normalizeGiftMediaUrl } from "@/utils/giftMediaUrl";

// ============= TYPES =============
export interface JoinNotification {
  id: string;
  oderId?: string; // Optional order reference
  userId: string;
  userName: string;
  userAvatar?: string;
  userLevel: number;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  user: string;
  initial: string;
  message: string;
  color: string;
  userLevel?: number;
  userAvatar?: string;
  isHost?: boolean;       // Host badge (red/pink)
  isNewUser?: boolean;    // NEW badge (new user)
  countryFlag?: string;   // Country flag
  isTrader?: boolean;     // Trader badge
  traderLevel?: number;   // Trader level
}

// ============= SINGLE JOIN NOTIFICATION - Premium Bigo/Chamet Style =============
interface PremiumJoinNotificationProps {
  notification: JoinNotification;
}

const PremiumJoinNotification = memo(({ notification }: PremiumJoinNotificationProps) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -200, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 150, scale: 0.85 }}
      transition={{
        type: "spring",
        damping: 20,
        stiffness: 280,
        mass: 0.8,
      }}
      className={cn(
        "flex items-center gap-2 py-1.5 pl-1.5 pr-3 rounded-r-full rounded-l-2xl w-fit",
        "bg-gradient-to-r",
        getJoinBannerBg(ensureValidLevel(notification.userLevel)),
        "backdrop-blur-lg shadow-xl",
        "border-l-4 border-l-white/40"
      )}
    >
      {/* Avatar with Frame - using unified AvatarWithFrame for purchased frames */}
      <div className="relative">
        <AvatarWithFrame
          userId={notification.userId}
          src={notification.userAvatar || getDisplayAvatar(notification.userName)}
          name={notification.userName}
          level={ensureValidLevel(notification.userLevel)}
          size="xs"
          showFrame={true}
          showAnimation={notification.userLevel >= 10}
        />
      </div>

      {/* Level Badge - Premium Compact */}
      <div className={cn(
        "px-2 py-0.5 rounded-md text-[9px] font-black shadow-md flex items-center gap-0.5",
        getLevelBadgeBg(ensureValidLevel(notification.userLevel)),
        getLevelTextColor(ensureValidLevel(notification.userLevel))
      )}>
        <span className="drop-shadow-sm">{formatLevel(notification.userLevel)}</span>
      </div>

      {/* Username */}
      <span className="text-white font-bold text-xs truncate max-w-[90px] drop-shadow-lg">
        {notification.userName}
      </span>

      {/* Joined Text with Sparkle */}
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

PremiumJoinNotification.displayName = 'PremiumJoinNotification';

// ============= SINGLE CHAT MESSAGE - Premium Style =============
interface PremiumChatMessageProps {
  message: ChatMessage;
}

const PremiumChatMessage = memo(({ message }: PremiumChatMessageProps) => {
  // Ensure level is at least 1 (never show 0) - Using centralized utility
  const level = ensureValidLevel(message.userLevel);
  
  // Extract gift icon URL from message format: [GIFT:url] sent GiftName x count
  const giftIconMatch = message.message.match(/\[GIFT:([^\]]*)\]/);
  const giftIconUrl = normalizeGiftMediaUrl(giftIconMatch?.[1]);
  // Clean message text - remove the [GIFT:url] prefix
  const cleanMessage = message.message.replace(/\[GIFT:[^\]]*\]\s*/, '');
  
  const isGiftMessage = message.message.includes('[GIFT:') || message.message.toLowerCase().includes('sent ');
  const isJoinMessage = cleanMessage.includes('entered') || cleanMessage.includes('joined');
  const isSystemMessage = message.user === 'System';
  const isHost = message.isHost || false;
  const isNewUser = message.isNewUser || false;

  const getBgStyle = () => {
    if (isHost) return "from-rose-600/85 via-pink-500/80 to-red-500/75";
    if (isGiftMessage) return "from-pink-600/80 via-rose-500/75 to-fuchsia-600/70";
    if (isJoinMessage) return "from-emerald-600/70 via-green-500/65 to-teal-500/60";
    if (isSystemMessage) return "from-amber-600/70 via-yellow-500/65 to-orange-500/60";
    return "from-black/60 via-slate-900/55 to-black/50";
  };

  const getBorderStyle = () => {
    if (isHost) return "border-rose-400/70";
    if (isGiftMessage) return "border-pink-400/60";
    if (isJoinMessage) return "border-emerald-400/50";
    if (isSystemMessage) return "border-amber-400/50";
    return "border-white/20";
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.85 }}
      transition={{
        type: "spring",
        damping: 25,
        stiffness: 300,
      }}
      className={cn(
        "flex items-center gap-1.5 py-1 px-2.5 rounded-full w-fit max-w-[92%]",
        "bg-gradient-to-r backdrop-blur-md shadow-lg",
        getBgStyle(),
        "border",
        getBorderStyle()
      )}
    >
      {/* Mini Avatar */}
      {message.userAvatar && (
        <Avatar className="w-5 h-5 border border-white/40">
          <AvatarImage src={message.userAvatar} alt={message.user} />
          <AvatarFallback className="bg-violet-500 text-white text-[8px] font-bold">
            {message.initial}
          </AvatarFallback>
        </Avatar>
      )}

      {/* HOST Badge - Bigo Style (Red/Pink gradient) */}
      {isHost && (
        <div className="px-1.5 py-0.5 rounded text-[8px] font-black bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-md shrink-0 border border-white/30">
          Host
        </div>
      )}

      {/* NEW Badge - For new users */}
      {isNewUser && !isHost && (
        <div className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-sm shrink-0 animate-pulse">
          🆕 NEW
        </div>
      )}

      {/* Level Badge */}
      <div className={cn(
        "px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0 shadow-sm",
        getLevelBadgeBg(level),
        getLevelTextColor(level)
      )}>
        <span className="drop-shadow-sm">{formatLevel(level)}</span>
      </div>

      {/* Country Flag */}
      {message.countryFlag && (
        <span className="text-xs shrink-0">{message.countryFlag}</span>
      )}

      {/* Username */}
      <span className={cn(
        "font-bold text-[10px] shrink-0 drop-shadow-md",
        isHost ? 'text-rose-100' : isGiftMessage ? 'text-pink-200' : isJoinMessage ? 'text-emerald-200' : 'text-cyan-200'
      )}>
        {message.user}
      </span>

      {/* Trader Badge */}
      {message.isTrader && <TraderBadge level={message.traderLevel || 1} size="xs" />}

      {/* Message Text - Show cleaned message without [GIFT:url] prefix */}
      <span className={cn(
        "text-[10px] truncate drop-shadow-sm flex-1 min-w-0",
        isGiftMessage ? 'text-pink-100 font-medium' : 'text-white/95'
      )}>
        {cleanMessage}
      </span>

      {/* Gift Image - Show actual gift icon from admin panel, NOT emoji */}
      {isGiftMessage && giftIconUrl && (
        <motion.div 
          className="w-6 h-6 shrink-0 rounded-md overflow-hidden bg-white/10 shadow-lg"
          animate={{ scale: [1, 1.3, 1], rotate: [0, 8, -8, 0] }}
          transition={{ duration: 0.6, repeat: 3 }}
        >
          <img 
            src={giftIconUrl} 
            alt="Gift" 
            className="w-full h-full object-contain"
            onError={(e) => {
              // Fallback if image fails to load
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

PremiumChatMessage.displayName = 'PremiumChatMessage';

// ============= HOOK: useJoinNotifications =============
export function useJoinNotifications() {
  const [notifications, setNotifications] = useState<JoinNotification[]>([]);

  // Auto-remove after 3.5 seconds
  useEffect(() => {
    if (notifications.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setNotifications(prev => prev.filter(n => now - n.timestamp < 3500));
    }, 400);

    return () => clearInterval(timer);
  }, [notifications.length]);

  const addNotification = useCallback((notification: Omit<JoinNotification, 'id' | 'timestamp'>) => {
    const newNotification: JoinNotification = {
      ...notification,
      id: `join_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    
    setNotifications(prev => {
      const updated = [...prev, newNotification];
      return updated.length > 6 ? updated.slice(-6) : updated; // Keep max 6
    });
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  return { notifications, addNotification, clearAll };
}

// ============= MAIN CONTAINER COMPONENT =============
interface PremiumJoinChatOverlayProps {
  messages: ChatMessage[];
  joinNotifications: JoinNotification[];
  maxMessages?: number; // Now optional - if not set, shows ALL messages
  maxHeight?: string; // Customizable max height
  className?: string;
}

export const PremiumJoinChatOverlay = memo(({
  messages,
  joinNotifications,
  maxMessages, // No default limit - shows ALL messages
  maxHeight = "200px", // Default scrollable area height
  className,
}: PremiumJoinChatOverlayProps) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Show all messages or limit if maxMessages is provided
  const displayMessages = maxMessages ? messages.slice(-maxMessages) : messages;
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages.length]);
  
  return (
    <div className={cn(
      "flex flex-col gap-1",
      className
    )}>
      {/* Join Notifications - Above chat messages (these auto-fade) */}
      <AnimatePresence mode="popLayout">
        {joinNotifications.map((notification) => (
          <PremiumJoinNotification key={notification.id} notification={notification} />
        ))}
      </AnimatePresence>

      {/* Scrollable Chat Container - ALL messages visible by scrolling */}
      <div 
        ref={chatContainerRef}
        className="flex flex-col gap-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
        style={{ maxHeight }}
      >
        {/* Chat messages - Oldest at top, newest at bottom */}
        {/* User can scroll UP to see older messages */}
        <AnimatePresence mode="popLayout">
          {displayMessages.map((msg) => (
            <PremiumChatMessage key={msg.id} message={msg} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
});

PremiumJoinChatOverlay.displayName = 'PremiumJoinChatOverlay';

// ============= RE-EXPORTS FOR BACKWARD COMPATIBILITY =============
export { PremiumJoinNotification, PremiumChatMessage };
export default PremiumJoinChatOverlay;
