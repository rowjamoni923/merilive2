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
  diamonds?: number;
  className?: string;
  /** Visual surface. Defaults to "chat". */
  surface?: InlineGiftSurface;
  /** "You sent" instead of "{name} sent" when current user is the sender */
  isSelf?: boolean;
  /** Even tighter padding for in-stream / list use */
  compact?: boolean;
  /** Optional trailing meta rendered inside the bubble (e.g. time + read ticks) */
  footerSlot?: React.ReactNode;
}

const InlineGiftRowInner = ({
  senderName,
  senderAvatar,
  giftName,
  giftIconUrl,
  giftEmoji,
  count,
  diamonds = 0,
  className,
  surface = "chat",
  isSelf = false,
  compact = false,
  footerSlot,
}: InlineGiftRowProps) => {
  // Subtle accent color for "xN" — keeps the bubble itself neutral
  // while still indicating gift tier the same way pro apps do.
  const accent =
    diamonds >= 10000
      ? "text-amber-500"
      : diamonds >= 1000
      ? "text-cyan-500"
      : "text-rose-500";

  const isOverlay = surface === "overlay";

  // Chamet-style chat card: white card with soft border, gift icon left,
  // centered "You/Name send {gift}" text, "x N" on the right.
  // Overlay variant: dark translucent pill for live/party/call overlays.
  if (!isOverlay) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", damping: 22, stiffness: 320 }}
        className={cn(
          "relative inline-flex items-center gap-2.5 rounded-2xl w-fit max-w-[260px]",
          "bg-card border border-border/70 shadow-sm",
          compact ? "pl-3 pr-3 pt-2 pb-3" : "pl-3.5 pr-3.5 pt-2.5 pb-3.5",
          className
        )}
      >
        {/* Gift icon — large, left */}
        <div className={cn("flex-shrink-0 flex items-center justify-center", compact ? "w-9 h-9" : "w-10 h-10")}>
          {giftIconUrl ? (
            <img
              loading="lazy"
              decoding="async"
              src={giftIconUrl}
              alt=""
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className={compact ? "text-2xl" : "text-3xl"}>{giftEmoji || "🎁"}</span>
          )}
        </div>

        {/* Centered label: "You send World cup" */}
        <div className="flex-1 min-w-0 flex items-center">
          <span
            className={cn(
              "truncate text-foreground/85 font-normal",
              compact ? "text-[13px]" : "text-[14px]"
            )}
          >
            {isSelf ? "You" : senderName} send{" "}
            <span className="font-medium text-foreground">{giftName}</span>
          </span>
        </div>

        {/* x N — muted, right */}
        <span
          className={cn(
            "flex-shrink-0 font-medium text-muted-foreground tabular-nums",
            compact ? "text-[13px]" : "text-[14px]"
          )}
        >
          x {count}
        </span>

        {/* Time + status — pinned bottom-right INSIDE the bubble (WhatsApp-style) */}
        {footerSlot && (
          <span className="absolute bottom-1 right-2.5 text-[9px] leading-none text-muted-foreground/70 flex items-center gap-0.5 pointer-events-none">
            {footerSlot}
          </span>
        )}
      </motion.div>
    );
  }

  // OVERLAY surface (Live/Party/Call) — dark translucent pill
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 22, stiffness: 320 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full w-fit max-w-full",
        "bg-black/55 border border-white/15 text-white backdrop-blur-md",
        compact ? "pl-1 pr-2 py-0.5" : "pl-1 pr-2 py-1",
        className
      )}
    >
      {senderAvatar ? (
        <img
          loading="lazy"
          decoding="async"
          src={senderAvatar}
          alt=""
          className="w-5 h-5 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[9px] bg-gradient-to-br from-pink-400 to-purple-500 flex-shrink-0">
          {senderName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="font-semibold truncate flex-shrink min-w-0 text-white text-[12px]" style={{ maxWidth: 84 }}>
        {isSelf ? "You" : senderName}
      </span>
      <span className="font-normal flex-shrink-0 text-white/70 text-[11px]">sent</span>
      <span className="font-semibold truncate flex-shrink min-w-0 text-white text-[12px]" style={{ maxWidth: 100 }}>
        {giftName}
      </span>
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
        {giftIconUrl ? (
          <img
            loading="lazy"
            decoding="async"
            src={giftIconUrl}
            alt=""
            className="w-6 h-6 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="text-[15px]">{giftEmoji || "🎁"}</span>
        )}
      </div>
      <span className={cn("font-bold leading-none flex-shrink-0 text-[13px]", accent)}>
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
//   [INLINE_GIFT:<iconUrl>|<giftName>|<count>|<diamonds>]
const INLINE_GIFT_RE = /\[INLINE_GIFT:([^\]]*)\]/;

export function encodeInlineGiftMarker(opts: {
  giftName: string;
  count: number;
  diamonds?: number;
  iconUrl?: string;
}): string {
  const { giftName, count, diamonds = 0, iconUrl = "" } = opts;
  const safe = (s: string) => String(s).replace(/\|/g, "\u2758").replace(/[\[\]]/g, "");
  return `[INLINE_GIFT:${safe(iconUrl)}|${safe(giftName)}|${Math.max(1, count | 0)}|${Math.max(0, diamonds | 0)}]`;
}

export function parseInlineGiftMarker(
  raw: string
): { iconUrl: string; giftName: string; count: number; diamonds: number } | null {
  const m = raw.match(INLINE_GIFT_RE);
  if (!m) return null;
  const parts = m[1].split("|");
  if (parts.length < 2) return null;
  const [iconUrl = "", giftName = "Gift", countStr = "1", diamondsStr = "0"] = parts;
  const count = Math.max(1, parseInt(countStr, 10) || 1);
  const diamonds = Math.max(0, parseInt(diamondsStr, 10) || 0);
  return { iconUrl, giftName, count, diamonds };
}
