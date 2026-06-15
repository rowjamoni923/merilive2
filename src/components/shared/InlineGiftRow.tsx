import React, { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * =====================================================
 * UNIFIED INLINE GIFT CHAT ROW (professional, compact)
 * =====================================================
 * Single shared component used across DM / Live / Party / Call / Profile
 * for the inline "sent <Gift> xN" entry that sits INSIDE chat history.
 *
 * Reference: Chamet / Bigo / Olamet pro live apps — a normal-sized
 * chat bubble, NOT a giant bright pill. The flying combo pill is a
 * different component (FlyingGiftAnimation).
 *
 * Two surfaces:
 *  - "chat"    → light muted bubble for DM / profile chat (default)
 *  - "overlay" → dark translucent pill for live/party/call overlays
 *
 * Layout (single row, fit-content):
 *   [avatar] sent  giftName  [icon]  x1
 * =====================================================
 */

export type InlineGiftSurface = "chat" | "overlay";

export interface InlineGiftRowProps {
  senderName: string;
  senderAvatar?: string;
  giftName: string;
  giftIconUrl?: string;
  giftEmoji?: string;
  count: number;
  coins?: number;
  className?: string;
  /** Visual surface. Defaults to "chat". */
  surface?: InlineGiftSurface;
  /** "You sent" instead of "{name} sent" when current user is the sender */
  isSelf?: boolean;
  /** Even tighter padding for in-stream / list use */
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
  surface = "chat",
  isSelf = false,
  compact = false,
}: InlineGiftRowProps) => {
  // Subtle accent color for "xN" — keeps the bubble itself neutral
  // while still indicating gift tier the same way pro apps do.
  const accent =
    coins >= 10000
      ? "text-amber-500"
      : coins >= 1000
      ? "text-cyan-500"
      : "text-rose-500";

  const isOverlay = surface === "overlay";

  const containerCls = isOverlay
    ? "bg-black/55 border border-white/15 text-white backdrop-blur-md"
    : "bg-muted/70 border border-border/60 text-foreground";

  const subTextCls = isOverlay ? "text-white/70" : "text-muted-foreground";
  const nameCls = isOverlay ? "text-white" : "text-foreground";
  const giftNameCls = isOverlay ? "text-white" : "text-foreground";

  const padding = compact ? "pl-1 pr-2 py-0.5" : "pl-1 pr-2 py-1";
  const gap = compact ? "gap-1" : "gap-1.5";
  const avatarSize = compact ? "w-4 h-4" : "w-5 h-5";
  const iconSize = compact ? "w-5 h-5" : "w-6 h-6";
  const textSize = compact ? "text-[11px]" : "text-[12px]";
  const subSize = compact ? "text-[10px]" : "text-[11px]";
  const countSize = compact ? "text-[12px]" : "text-[13px]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 22, stiffness: 320 }}
      className={cn(
        "inline-flex items-center rounded-full w-fit max-w-full",
        containerCls,
        padding,
        gap,
        className
      )}
    >
      {/* Sender avatar */}
      {senderAvatar ? (
        <img
          loading="lazy"
          decoding="async"
          src={senderAvatar}
          alt=""
          className={cn(avatarSize, "rounded-full object-cover flex-shrink-0")}
        />
      ) : (
        <div
          className={cn(
            avatarSize,
            "rounded-full flex items-center justify-center text-white font-bold text-[9px] bg-gradient-to-br from-pink-400 to-purple-500 flex-shrink-0"
          )}
        >
          {senderName.charAt(0).toUpperCase()}
        </div>
      )}

      {/* "You" / sender name */}
      <span className={cn("font-semibold truncate flex-shrink min-w-0", nameCls, textSize)} style={{ maxWidth: 84 }}>
        {isSelf ? "You" : senderName}
      </span>

      {/* "sent" */}
      <span className={cn("font-normal flex-shrink-0", subTextCls, subSize)}>sent</span>

      {/* Gift name */}
      <span
        className={cn("font-semibold truncate flex-shrink min-w-0", giftNameCls, textSize)}
        style={{ maxWidth: 100 }}
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
            className={cn(iconSize, "object-contain")}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className={compact ? "text-[14px]" : "text-[15px]"}>{giftEmoji || "🎁"}</span>
        )}
      </div>

      {/* xN */}
      <span className={cn("font-bold leading-none flex-shrink-0", accent, countSize)}>
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
