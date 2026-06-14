import React, { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * =====================================================
 * UNIFIED INLINE GIFT CHAT ROW
 * =====================================================
 * Single shared component used across DM / Live / Party / Call
 * for the inline "sent <Gift> xN" chat-strip row that sits
 * inside the regular chat history (NOT the flying pill).
 *
 * Tier ladder matches FlyingGiftAnimation pill:
 *  - GOLD  (coins >= 10000)
 *  - TEAL  (coins >= 1000)
 *  - ROSE  (default)
 *
 * Layout: [avatar?] [sender] "sent" [giftName] [giftIcon] xN
 * Single-row, full-rounded, gradient — Chamet/Bigo parity.
 * =====================================================
 */

export interface InlineGiftRowProps {
  senderName: string;
  senderAvatar?: string;
  giftName: string;
  giftIconUrl?: string;
  giftEmoji?: string;
  count: number;
  coins?: number;
  className?: string;
  /** Compact mode shrinks paddings/text — for tight chat strips */
  compact?: boolean;
}

const InlineGiftRowInner = ({
  senderName,
  senderAvatar,
  giftName,
  giftIconUrl,
  giftEmoji,
  count,
  coins = 0,
  className,
  compact = false,
}: InlineGiftRowProps) => {
  const tier: "gold" | "teal" | "rose" =
    coins >= 10000 ? "gold" : coins >= 1000 ? "teal" : "rose";

  const styles = {
    gold: {
      bg: "linear-gradient(90deg, rgba(180,120,20,0.85) 0%, rgba(234,179,8,0.82) 50%, rgba(253,224,71,0.7) 100%)",
      ring: "rgba(253,224,71,0.6)",
      glow: "0 4px 14px rgba(234,179,8,0.3)",
      countText: "from-amber-100 via-yellow-200 to-orange-300",
      giftText: "text-amber-100",
    },
    teal: {
      bg: "linear-gradient(90deg, rgba(15,118,110,0.85) 0%, rgba(20,184,166,0.82) 50%, rgba(94,234,212,0.7) 100%)",
      ring: "rgba(94,234,212,0.55)",
      glow: "0 4px 14px rgba(20,184,166,0.3)",
      countText: "from-cyan-100 via-teal-200 to-emerald-300",
      giftText: "text-cyan-100",
    },
    rose: {
      bg: "linear-gradient(90deg, rgba(159,18,57,0.85) 0%, rgba(225,29,72,0.82) 50%, rgba(251,113,133,0.7) 100%)",
      ring: "rgba(251,113,133,0.55)",
      glow: "0 4px 14px rgba(225,29,72,0.28)",
      countText: "from-rose-100 via-pink-200 to-rose-300",
      giftText: "text-rose-100",
    },
  }[tier];

  const avatarSize = compact ? "w-5 h-5" : "w-6 h-6";
  const iconSize = compact ? "w-6 h-6" : "w-7 h-7";
  const textSize = compact ? "text-[10.5px]" : "text-[12px]";
  const countSize = compact ? "text-base" : "text-lg";

  return (
    <motion.div
      initial={{ opacity: 0, x: -16, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: "spring", damping: 22, stiffness: 320 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full backdrop-blur-md w-fit max-w-full",
        compact ? "pl-1 pr-2 py-0.5" : "pl-1 pr-2.5 py-1",
        className
      )}
      style={{
        background: styles.bg,
        boxShadow: styles.glow,
        border: `1px solid ${styles.ring}`,
      }}
    >
      {/* Sender avatar */}
      {senderAvatar ? (
        <img
          loading="lazy"
          decoding="async"
          src={senderAvatar}
          alt=""
          className={cn(avatarSize, "rounded-full border object-cover flex-shrink-0")}
          style={{ borderColor: styles.ring }}
        />
      ) : (
        <div
          className={cn(
            avatarSize,
            "rounded-full border flex items-center justify-center text-white font-bold text-[9px] bg-gradient-to-br from-pink-400 to-purple-500 flex-shrink-0"
          )}
          style={{ borderColor: styles.ring }}
        >
          {senderName.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Sender · sent · giftName */}
      <span
        className={cn(
          "font-bold text-white truncate drop-shadow-sm flex-shrink min-w-0",
          textSize
        )}
        style={{ maxWidth: 88 }}
      >
        {senderName}
      </span>
      <span className={cn("text-white/75 font-medium flex-shrink-0", compact ? "text-[9px]" : "text-[10px]")}>
        sent
      </span>
      <span
        className={cn("font-bold truncate drop-shadow-sm flex-shrink min-w-0", styles.giftText, textSize)}
        style={{ maxWidth: 92 }}
      >
        {giftName}
      </span>

      {/* Gift icon */}
      <div className={cn(iconSize, "flex-shrink-0 flex items-center justify-center")}>
        {giftIconUrl ? (
          <img
            loading="lazy"
            decoding="async"
            src={giftIconUrl}
            alt=""
            className={cn(iconSize, "object-contain drop-shadow")}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className={compact ? "text-lg" : "text-xl"}>{giftEmoji || "🎁"}</span>
        )}
      </div>

      {/* xN */}
      <span
        className={cn(
          "font-black leading-none bg-gradient-to-b bg-clip-text text-transparent flex-shrink-0",
          countSize,
          styles.countText
        )}
        style={{
          WebkitTextStroke: "0.5px rgba(255,255,255,0.3)",
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
        }}
      >
        x{count}
      </span>
    </motion.div>
  );
};

export const InlineGiftRow = memo(InlineGiftRowInner);
InlineGiftRow.displayName = "InlineGiftRow";

export default InlineGiftRow;

// ===== Inline gift marker helpers =====
// Canonical chat marker so any surface can serialize a gift row into a
// plain message string and detect+render it without bespoke metadata:
//   [INLINE_GIFT:<iconUrl>|<giftName>|<count>|<coins>]
const INLINE_GIFT_RE = /\[INLINE_GIFT:([^\]]*)\]/;

export function encodeInlineGiftMarker(opts: {
  giftName: string;
  count: number;
  coins?: number;
  iconUrl?: string;
}): string {
  const { giftName, count, coins = 0, iconUrl = "" } = opts;
  // Escape pipes inside name/url to keep the marker parseable.
  const safe = (s: string) => String(s).replace(/\|/g, "\u2758").replace(/[\[\]]/g, "");
  return `[INLINE_GIFT:${safe(iconUrl)}|${safe(giftName)}|${Math.max(1, count | 0)}|${Math.max(0, coins | 0)}]`;
}

export function parseInlineGiftMarker(
  raw: string
): { iconUrl: string; giftName: string; count: number; coins: number } | null {
  const m = raw.match(INLINE_GIFT_RE);
  if (!m) return null;
  const parts = m[1].split("|");
  if (parts.length < 2) return null;
  const [iconUrl = "", giftName = "Gift", countStr = "1", coinsStr = "0"] = parts;
  const count = Math.max(1, parseInt(countStr, 10) || 1);
  const coins = Math.max(0, parseInt(coinsStr, 10) || 0);
  return { iconUrl, giftName, count, coins };
}
