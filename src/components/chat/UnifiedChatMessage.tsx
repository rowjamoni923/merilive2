/**
 * =====================================================
 * UNIFIED CHAT MESSAGE — Single Source of Truth
 * =====================================================
 *
 * One primitive used across every chat surface so styling
 * stays 100% consistent and premium:
 *
 *   • RoomChatBubble    → Live stream, Private call, Audio Party,
 *                         Video Party, Game Party (TikTok / Bigo
 *                         overlay style, dark glass on video)
 *
 *   • DirectChatBubble  → Personal DM / inbox messages
 *                         (WhatsApp / Telegram bubble style)
 *
 * Both variants share level badges, host/VIP/trader chips, name
 * coloring, designer SVGA bubble wrapper, gift / join / system
 * pills, and timestamps with read-receipts.
 *
 * ⚠ Host + public visibility rules (live, parties, private call):
 *   - Anyone in the room sends → everyone (incl. host) sees.
 *   - Host sends → everyone in the room sees.
 *   This component is presentation-only; the surfaces feed it
 *   already-filtered streams, so visibility stays unchanged.
 * =====================================================
 */

import { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { InlineLevelBadge } from "@/components/common/LevelBadge";
import TraderBadge from "@/components/common/TraderBadge";
import { MessageBubbleWrapper } from "@/components/chat/MessageBubbleWrapper";
import { MessageStatusIndicator } from "@/components/chat/MessageStatusIndicator";

// ============================================================
// Shared types
// ============================================================
export type ChatMessageKind =
  | "message"
  | "gift"
  | "join"
  | "leave"
  | "system"
  | "entrance";

export interface UnifiedChatMessageData {
  id: string;
  userName: string;
  message: string;
  userLevel?: number;
  isHost?: boolean;
  isVIP?: boolean;
  vipTier?: number;
  isTrader?: boolean;
  traderLevel?: number;
  type?: ChatMessageKind;
  giftName?: string;
  giftCount?: number;
  giftEmoji?: string;
  bubbleUrl?: string; // designer SVGA / image bubble URL
  createdAt?: string | number | Date;
}

// ============================================================
// Helper — name color tier (premium gradient feel)
// ============================================================
const nameColorClass = (
  isHost?: boolean,
  isVIP?: boolean,
  vipTier = 0,
  userLevel = 1,
) => {
  if (isHost) return "text-pink-300";
  if (isVIP && vipTier >= 5) return "text-pink-200";
  if (isVIP && vipTier >= 3) return "text-cyan-200";
  if (isVIP) return "text-amber-300";
  if (userLevel >= 30) return "text-amber-300";
  if (userLevel >= 20) return "text-purple-300";
  if (userLevel >= 10) return "text-cyan-300";
  return "text-white/85";
};

const vipChipClass = (vipTier = 0) =>
  cn(
    "inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold",
    vipTier >= 5
      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
      : vipTier >= 3
        ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white"
        : "bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900",
  );

const formatTime = (v?: string | number | Date) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// ============================================================
// 1. ROOM CHAT BUBBLE — Live / Private call / Parties
// ============================================================
export const RoomChatBubble = memo(function RoomChatBubble({
  userName,
  message,
  userLevel = 1,
  isHost,
  isVIP,
  vipTier = 0,
  isTrader,
  traderLevel = 0,
  type = "message",
  giftName,
  giftCount,
  giftEmoji,
  bubbleUrl,
}: UnifiedChatMessageData) {
  // -- Join / entrance pill --
  if (type === "join" || type === "entrance") {
    return (
      <motion.div
        initial={{ x: -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 60, opacity: 0 }}
        className="flex items-center gap-1.5 py-1 px-2 rounded-full bg-gradient-to-r from-purple-500/25 to-pink-500/25 backdrop-blur-sm w-fit"
      >
        <InlineLevelBadge level={userLevel} />
        <span className="text-white font-semibold text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
          {userName}
        </span>
        <span className="text-white/70 text-[11px]">entered the room</span>
      </motion.div>
    );
  }

  // -- Gift pill --
  if (type === "gift") {
    return (
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-gradient-to-r from-amber-500/30 to-orange-500/30 backdrop-blur-sm w-fit border border-amber-400/30"
      >
        <InlineLevelBadge level={userLevel} />
        <span className="text-amber-200 font-semibold text-xs">{userName}</span>
        <span className="text-white/80 text-xs">sent</span>
        {giftEmoji && <span className="text-lg">{giftEmoji}</span>}
        {giftName && (
          <span className="text-amber-300 font-bold text-xs">{giftName}</span>
        )}
        {giftCount && giftCount > 1 && (
          <motion.span
            className="text-amber-400 font-black text-sm"
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 0.5, repeat: 2 }}
          >
            ×{giftCount}
          </motion.span>
        )}
      </motion.div>
    );
  }

  // -- System line --
  if (type === "system" || type === "leave") {
    return (
      <div className="text-center py-1">
        <span className="text-white/60 text-[11px] bg-white/5 backdrop-blur-sm px-3 py-1 rounded-full">
          {message}
        </span>
      </div>
    );
  }

  // -- Designer SVGA bubble (VIP / Noble) --
  if (bubbleUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="py-0.5"
      >
        <MessageBubbleWrapper
          bubbleUrl={bubbleUrl}
          safeAreaClassName="px-4 py-2"
          maxWidthClassName="max-w-[280px]"
        >
          <div className="flex flex-wrap items-center gap-1">
            <InlineLevelBadge level={userLevel} />
            {/* Audit-fix (Label #10): designer-bubble variant previously
                omitted Host + Trader chips, so VIP hosts lost their
                "Host" label in chat. Mirror the regular-line set. */}
            {isHost && (
              <span className="inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold bg-gradient-to-r from-red-500 to-pink-500 text-white">
                Host
              </span>
            )}
            {isVIP && <span className={vipChipClass(vipTier)}>VIP{vipTier || ""}</span>}
            {isTrader && <TraderBadge level={traderLevel} size="xs" />}
            <span
              className={cn(
                "font-bold text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
                nameColorClass(isHost, isVIP, vipTier, userLevel),
              )}
            >
              {userName}:
            </span>
            <span className="text-white text-xs break-words drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {message}
            </span>
          </div>
        </MessageBubbleWrapper>
      </motion.div>
    );
  }

  // -- Regular room chat line --
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-start gap-1 py-0.5"
    >
      <InlineLevelBadge level={userLevel} />
      {isHost && (
        <span className="inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold bg-gradient-to-r from-red-500 to-pink-500 text-white">
          Host
        </span>
      )}
      {isVIP && <span className={vipChipClass(vipTier)}>VIP{vipTier || ""}</span>}
      {isTrader && <TraderBadge level={traderLevel} size="xs" />}
      <span
        className={cn(
          "font-semibold text-xs",
          nameColorClass(isHost, isVIP, vipTier, userLevel),
        )}
      >
        {userName}:
      </span>
      <span className="text-white/95 text-xs break-words drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
        {message}
      </span>
    </motion.div>
  );
});

// ============================================================
// 2. DIRECT CHAT BUBBLE — Personal DM (WhatsApp / Telegram)
// ============================================================
export interface DirectChatBubbleProps {
  message: string;
  isMine: boolean;
  createdAt?: string | number | Date;
  status?: "sending" | "sent" | "delivered" | "read";
  optimistic?: boolean;
  children?: React.ReactNode; // optional rich content (image, audio…)
}

export const DirectChatBubble = memo(function DirectChatBubble({
  message,
  isMine,
  createdAt,
  status,
  optimistic,
  children,
}: DirectChatBubbleProps) {
  const time = formatTime(createdAt);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex w-full", isMine ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-2.5 py-1.5 text-[13px] leading-[1.35] shadow-sm",
          isMine
            ? "bg-gradient-to-br from-fuchsia-500 via-purple-500 to-violet-600 text-slate-900 rounded-br-sm shadow-purple-500/20"
            : "text-slate-800 rounded-bl-sm",
          optimistic && "opacity-70",
        )}
        style={
          !isMine
            ? {
                background:
                  "linear-gradient(135deg, #ffffff 0%, hsl(40 40% 99%) 100%)",
                border: "1px solid hsl(40 35% 88% / 0.7)",
              }
            : undefined
        }
      >
        {children ?? <span className="break-words">{message}</span>}
        <span
          className={cn(
            "text-[9px] ml-1 float-right mt-1.5 flex items-center gap-0.5",
            isMine ? "text-slate-600" : "text-slate-500",
          )}
        >
          {time}
          {status && (
            <MessageStatusIndicator status={status} isMine={isMine} />
          )}
        </span>
      </div>
    </motion.div>
  );
});

// ============================================================
// Back-compat re-export
// ============================================================
export { RoomChatBubble as ProfessionalChatMessage };
export default RoomChatBubble;
