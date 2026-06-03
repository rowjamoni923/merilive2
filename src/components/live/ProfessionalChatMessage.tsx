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
        className="flex items-center gap-1.5 py-1 pl-1.5 pr-2.5 rounded-full bg-gradient-to-r from-purple-500/35 via-fuchsia-500/25 to-pink-500/35 backdrop-blur-md border border-white/15 shadow-[0_2px_10px_rgba(168,85,247,0.25)] w-fit"
      >
        <InlineLevelBadge level={userLevel} />
        <motion.span 
          className="text-white font-semibold text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
          animate={{ 
            textShadow: userLevel >= 20 
              ? ["0 0 5px rgba(255,255,255,0.3)", "0 0 10px rgba(255,255,255,0.5)", "0 0 5px rgba(255,255,255,0.3)"]
              : "none"
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {userName}
        </motion.span>
        <span className="text-white/75 text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">enter the live room</span>
      </motion.div>
    );
  }

  // Gift message with special styling
  if (type === 'gift') {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500/40 via-orange-500/35 to-rose-500/35 backdrop-blur-md w-fit border border-amber-300/40 shadow-[0_2px_12px_rgba(251,191,36,0.3)]"
      >
        <InlineLevelBadge level={userLevel} />
        <span className="text-amber-100 font-semibold text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{userName}</span>
        <span className="text-white/85 text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">sent</span>
        <span className="text-lg drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">{giftEmoji}</span>
        <span className="text-amber-200 font-bold text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{giftName}</span>
        {giftCount && giftCount > 1 && (
          <motion.span 
            className="text-amber-300 font-black text-sm drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]"
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
        <span className="text-white/70 text-xs bg-black/30 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
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

            {/* Audit-fix (Label #10): Host + Trader badges were missing
                from the designer-bubble variant. Now mirror regular line. */}
            {isHost && (
              <span className="inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold bg-gradient-to-r from-red-500 to-pink-500 text-white">
                Host
              </span>
            )}

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

            {isTrader && <TraderBadge level={traderLevel} size="xs" />}

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

  // Regular chat message with level badge — wrapped in glass chip for
  // premium readability over live video / party scene / call background.
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-1 py-0.5 px-2.5 rounded-2xl bg-black/35 backdrop-blur-md border border-white/10 shadow-[0_1px_6px_rgba(0,0,0,0.35)] w-fit max-w-full"
    >
      {/* Level Badge */}
      <InlineLevelBadge level={userLevel} />
      
      {/* Host Badge */}
      {isHost && (
        <span className="inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-[0_1px_3px_rgba(244,63,94,0.5)]">
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
          "font-semibold text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]",
          isHost ? "text-pink-300" : 
          isVIP && vipTier >= 3 ? "text-cyan-300" :
          isVIP ? "text-amber-300" :
          userLevel >= 30 ? "text-amber-300" :
          userLevel >= 20 ? "text-purple-300" :
          userLevel >= 10 ? "text-cyan-300" :
          "text-white/90"
        )}
      >
        {userName}:
      </span>
      
      {/* Message */}
      <span className="text-white text-xs break-words drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] leading-snug">{message}</span>
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
