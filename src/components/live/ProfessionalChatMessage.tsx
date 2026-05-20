import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LevelBadge, InlineLevelBadge } from "@/components/common/LevelBadge";
import TraderBadge from "@/components/common/TraderBadge";
import { MessageBubbleWrapper } from "@/components/chat/MessageBubbleWrapper";

interface ChatMessageProps {
  id: string;
  userName: string;
  message: string;
  userLevel?: number;
  isHost?: boolean;
  isVIP?: boolean;
  vipTier?: number;
  type?: 'message' | 'gift' | 'join' | 'leave' | 'system' | 'entrance';
  giftName?: string;
  giftCount?: number;
  giftEmoji?: string;
  bubbleUrl?: string;
  isTrader?: boolean;
  traderLevel?: number;
}

export const ProfessionalChatMessage = ({
  userName,
  message,
  userLevel = 1,
  isHost = false,
  isVIP = false,
  vipTier = 0,
  type = 'message',
  giftName,
  giftCount,
  giftEmoji,
  bubbleUrl,
  isTrader = false,
  traderLevel = 0
}: ChatMessageProps) => {
  // Entrance message with flying name animation
  if (type === 'join' || type === 'entrance') {
    return (
      <motion.div
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 100, opacity: 0 }}
        className="flex items-center gap-1.5 py-1 px-2 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-sm w-fit"
      >
        <InlineLevelBadge level={userLevel} />
        <motion.span 
          className="text-white font-semibold text-xs"
          animate={{ 
            textShadow: userLevel >= 20 
              ? ["0 0 5px rgba(255,255,255,0.3)", "0 0 10px rgba(255,255,255,0.5)", "0 0 5px rgba(255,255,255,0.3)"]
              : "none"
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {userName}
        </motion.span>
        <span className="text-white/70 text-xs">enter the live room</span>
      </motion.div>
    );
  }

  // Gift message with special styling
  if (type === 'gift') {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-gradient-to-r from-amber-500/30 to-orange-500/30 backdrop-blur-sm w-fit border border-amber-500/30"
      >
        <InlineLevelBadge level={userLevel} />
        <span className="text-amber-200 font-semibold text-xs">{userName}</span>
        <span className="text-white/80 text-xs">sent</span>
        <span className="text-lg">{giftEmoji}</span>
        <span className="text-amber-300 font-bold text-xs">{giftName}</span>
        {giftCount && giftCount > 1 && (
          <motion.span 
            className="text-amber-400 font-black text-sm"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.5, repeat: 2 }}
          >
            x{giftCount}
          </motion.span>
        )}
      </motion.div>
    );
  }

  // System message
  if (type === 'system') {
    return (
      <div className="text-center py-1">
        <span className="text-white/70 text-xs bg-white/5 px-3 py-1 rounded-full">
          {message}
        </span>
      </div>
    );
  }

  // VIP / Noble chat message with custom designer SVGA bubble
  // The bubble image WRAPS the message content (Chamet/MICO-style designer bubble)
  if (bubbleUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="py-0.5"
      >
        <MessageBubbleWrapper
          bubbleUrl={bubbleUrl}
          safeAreaClassName="px-4 py-2"
          maxWidthClassName="max-w-[280px]"
        >
          <div className="flex flex-wrap items-center gap-1">
            {/* Level Badge */}
            <InlineLevelBadge level={userLevel} />

            {/* VIP Badge with tier-specific styling */}
            {isVIP && (
              <span className={cn(
                "inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold",
                vipTier >= 5 ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white" :
                vipTier >= 3 ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white" :
                "bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900"
              )}>
                VIP{vipTier}
              </span>
            )}

            {/* User Name */}
            <span
              className={cn(
                "font-bold text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
                vipTier >= 5 ? "text-pink-200" :
                vipTier >= 3 ? "text-cyan-200" :
                "text-amber-200"
              )}
            >
              {userName}:
            </span>

            {/* Message — sits inside the designer bubble */}
            <span className="text-white text-xs break-words drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {message}
            </span>
          </div>
        </MessageBubbleWrapper>
      </motion.div>
    );
  }

  // Regular chat message with level badge
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-start gap-1 py-0.5"
    >
      {/* Level Badge */}
      <InlineLevelBadge level={userLevel} />
      
      {/* Host Badge */}
      {isHost && (
        <span className="inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold bg-gradient-to-r from-red-500 to-pink-500 text-white">
          Host
        </span>
      )}
      
      {/* VIP Badge */}
      {isVIP && (
        <span className={cn(
          "inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold",
          vipTier >= 5 ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white" :
          vipTier >= 3 ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white" :
          "bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900"
        )}>
          VIP{vipTier > 0 ? vipTier : ''}
        </span>
      )}
      
      {/* Trader Badge */}
      {isTrader && <TraderBadge level={traderLevel} size="xs" />}
      
      {/* User Name */}
      <span 
        className={cn(
          "font-semibold text-xs",
          isHost ? "text-pink-400" : 
          isVIP && vipTier >= 3 ? "text-cyan-300" :
          isVIP ? "text-amber-300" :
          userLevel >= 30 ? "text-amber-300" :
          userLevel >= 20 ? "text-purple-300" :
          userLevel >= 10 ? "text-cyan-300" :
          "text-white/80"
        )}
      >
        {userName}:
      </span>
      
      {/* Message */}
      <span className="text-white/90 text-xs break-words">{message}</span>
    </motion.div>
  );
};

// Chat container with scrollable area
interface ProfessionalChatProps {
  messages: Array<{
    id: string;
    user: string;
    message: string;
    level?: number;
    isHost?: boolean;
    isVIP?: boolean;
    vipTier?: number;
    type?: 'message' | 'gift' | 'join' | 'leave' | 'system' | 'entrance';
    giftName?: string;
    giftCount?: number;
    giftEmoji?: string;
    bubbleUrl?: string;
  }>;
  className?: string;
}

export const ProfessionalChat = ({ messages, className }: ProfessionalChatProps) => {
  return (
    <div className={cn("flex flex-col gap-1 overflow-y-auto scrollbar-hide", className)}>
      {messages.map((msg, index) => (
        <ProfessionalChatMessage
          key={msg.id || index}
          id={msg.id}
          userName={msg.user}
          message={msg.message}
          userLevel={msg.level || 1}
          isHost={msg.isHost}
          isVIP={msg.isVIP}
          vipTier={msg.vipTier}
          type={msg.type}
          giftName={msg.giftName}
          giftCount={msg.giftCount}
          giftEmoji={msg.giftEmoji}
          bubbleUrl={msg.bubbleUrl}
        />
      ))}
    </div>
  );
};

export default ProfessionalChatMessage;
