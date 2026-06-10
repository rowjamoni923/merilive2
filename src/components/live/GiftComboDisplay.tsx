/**
 * GiftComboDisplay — Bigo/Chamet/TikTok-LIVE class combo counter pill.
 *
 * Phase 1 (research-locked 2026-06-10):
 *  - Bottom-left anchored (parent <GiftComboTracker/> already positions us; we
 *    are NOT `fixed` anymore).
 *  - Italic compressed chrome-gold "xN" numeral with hard black stroke + 3D
 *    bevel — the typography move that separates "premium" from "generic".
 *  - 4-tier milestone burst engine: x5 → punch, x10 → +6 canvas sparks,
 *    x50 → +edge-flash + fire-ring, x99/x100 → +full-frame flash.
 *  - Per-tap spring 1.0→1.55→0.95→1.0 (~220ms) — triggers on every count delta.
 *  - Number swap = Y-axis cross-fade slide (80ms), no remount blink.
 *  - Lifecycle is owned by the parent (4s reset-on-tap); we just render.
 *
 * Server-authoritative scoring + tracker queue logic are UNTOUCHED. Pure
 * visual layer rewrite. APK rebuild NOT required.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LevelBadge } from "@/components/common/LevelBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface GiftCombo {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderLevel: number;
  receiverName: string;
  giftName: string;
  giftEmoji: string;
  giftIcon?: string;
  count: number;
  totalValue: number;
}

interface GiftComboDisplayProps {
  combo: GiftCombo | null;
  onComplete?: () => void;
  onDismiss?: () => void;
}

// Milestone thresholds (Bigo/Chamet teardown 2024-2026)
const MILESTONES = { spark: 10, fireRing: 50, fullFlash: 99 } as const;

/** Decide tier from total coin value (kept for premium pill chrome). */
function getTier(totalValue: number) {
  const isLegendary = totalValue >= 10000;
  const isPremium = totalValue >= 1000;
  return { isPremium, isLegendary };
}

export const GiftComboDisplay = ({ combo, onComplete, onDismiss }: GiftComboDisplayProps) => {
  const [milestoneTick, setMilestoneTick] = useState(0); // forces per-burst keyframe re-run
  const [isPressed, setIsPressed] = useState(false);
  const lastCountRef = useRef(0);
  const lastMilestoneRef = useRef(0);

  useEffect(() => {
    if (!combo) return;
    if (combo.count !== lastCountRef.current) {
      lastCountRef.current = combo.count;
      // Re-trigger burst keyframe whenever count changes (per-tap punch).
      setMilestoneTick((n) => n + 1);
    }
  }, [combo?.count, combo]);

  if (!combo) return null;

  const { isPremium, isLegendary } = getTier(combo.totalValue);
  const count = combo.count;

  // Determine if this tick crosses a milestone (×10, ×50, ×99/×100).
  const crossedFullFlash = count >= MILESTONES.fullFlash && lastMilestoneRef.current < MILESTONES.fullFlash;
  const crossedFireRing = count >= MILESTONES.fireRing && lastMilestoneRef.current < MILESTONES.fireRing;
  const crossedSpark = count >= MILESTONES.spark && lastMilestoneRef.current < MILESTONES.spark;
  // Use the highest active milestone (sticky after crossed, until lane resets).
  const showFullFlash = count >= MILESTONES.fullFlash;
  const showFireRing = count >= MILESTONES.fireRing;
  const showSparkBurst = count >= MILESTONES.spark;
  // Update sticky ref so future renders see the upgraded tier.
  if (count > lastMilestoneRef.current) lastMilestoneRef.current = count;

  // Tier palette (kept from previous design — already on-spec).
  const tier = isLegendary
    ? {
        bg: "linear-gradient(135deg, rgba(251,191,36,0.95) 0%, rgba(252,211,77,0.95) 50%, rgba(217,119,6,0.95) 100%)",
        border: "2px solid rgba(254,243,199,0.7)",
        glow:
          "0 0 0 1px rgba(254,243,199,0.4), 0 18px 50px -10px rgba(251,191,36,0.7), 0 8px 24px -8px rgba(217,119,6,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
        pulseGlow: [
          "0 0 30px rgba(251,191,36,0.45), 0 0 60px rgba(217,119,6,0.25)",
          "0 0 50px rgba(251,191,36,0.75), 0 0 100px rgba(217,119,6,0.45)",
          "0 0 30px rgba(251,191,36,0.45), 0 0 60px rgba(217,119,6,0.25)",
        ],
        nameText: "text-amber-950",
        subText: "text-amber-900",
        receiverText: "text-amber-950",
        glowColor: "rgba(251,191,36,0.95)",
        sparkleColor: "#fde68a",
      }
    : isPremium
    ? {
        bg: "linear-gradient(135deg, rgba(126,34,206,0.92) 0%, rgba(192,38,211,0.92) 50%, rgba(219,39,119,0.92) 100%)",
        border: "1.5px solid rgba(244,114,182,0.45)",
        glow:
          "0 0 0 1px rgba(244,114,182,0.25), 0 16px 44px -10px rgba(168,85,247,0.65), 0 6px 22px -8px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
        pulseGlow: [
          "0 0 24px rgba(168,85,247,0.35), 0 0 50px rgba(236,72,153,0.2)",
          "0 0 44px rgba(168,85,247,0.6), 0 0 80px rgba(236,72,153,0.4)",
          "0 0 24px rgba(168,85,247,0.35), 0 0 50px rgba(236,72,153,0.2)",
        ],
        nameText: "text-white",
        subText: "text-white/75",
        receiverText: "text-pink-200",
        glowColor: "rgba(236,72,153,0.85)",
        sparkleColor: "#f0abfc",
      }
    : {
        bg: "linear-gradient(135deg, rgba(10,10,10,0.78) 0%, rgba(30,27,75,0.85) 100%)",
        border: "1px solid rgba(255,255,255,0.14)",
        glow:
          "0 12px 32px -10px rgba(0,0,0,0.6), 0 4px 14px -6px rgba(168,85,247,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
        pulseGlow: [] as string[],
        nameText: "text-white",
        subText: "text-white/70",
        receiverText: "text-pink-300",
        glowColor: "rgba(168,85,247,0.5)",
        sparkleColor: "#fde047",
      };

  // Hard chrome-gold gradient on numerals only (per research: keep "x" white
  // for contrast against the gold "N"). 3D bevel via dual text-shadow.
  const numeralStyle: React.CSSProperties = {
    background: "linear-gradient(180deg, #fffbeb 0%, #fde68a 35%, #f59e0b 65%, #b45309 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    WebkitTextStroke: "1.5px rgba(0,0,0,0.85)",
    filter: `drop-shadow(0 2px 6px ${tier.glowColor}) drop-shadow(0 0 12px ${tier.glowColor})`,
    textShadow:
      "0 1px 0 rgba(255,255,255,0.55), 0 -1px 0 rgba(0,0,0,0.4), 0 2px 4px rgba(120,53,15,0.45)",
    fontStyle: "italic",
    letterSpacing: "-0.5px",
    transform: "skewX(-6deg)",
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -60, scale: 0.85 }}
        animate={{ opacity: 1, x: 0, scale: isPressed ? 0.92 : 1 }}
        exit={{ opacity: 0, x: -40, scale: 0.85 }}
        transition={{ type: "spring", damping: 22, stiffness: 320 }}
        className="relative cursor-pointer select-none"
        onClick={() => {
          setIsPressed(true);
          setTimeout(() => onDismiss?.(), 120);
        }}
        onTouchStart={() => setIsPressed(true)}
        onTouchEnd={() => {
          setTimeout(() => setIsPressed(false), 120);
        }}
      >
        {/* Premium ambient glow */}
        {isPremium && (
          <motion.div
            className="absolute inset-0 -z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.35, 0.6, 0.35], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <div
              className="w-full h-full rounded-3xl blur-3xl"
              style={{
                background: isLegendary
                  ? "radial-gradient(60% 60% at 50% 50%, rgba(251,191,36,0.6) 0%, rgba(217,119,6,0.35) 50%, transparent 80%)"
                  : "radial-gradient(60% 60% at 50% 50%, rgba(168,85,247,0.5) 0%, rgba(236,72,153,0.35) 50%, transparent 80%)",
              }}
            />
          </motion.div>
        )}

        {/* Main pill */}
        <motion.div
          className="relative flex items-center gap-2.5 pl-2 pr-3.5 py-2 rounded-full overflow-hidden"
          style={{
            background: tier.bg,
            border: tier.border,
            backdropFilter: "blur(16px) saturate(150%)",
            WebkitBackdropFilter: "blur(16px) saturate(150%)",
            boxShadow: tier.glow,
          }}
          animate={isPremium && tier.pulseGlow.length ? { boxShadow: tier.pulseGlow } : {}}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Aurora */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(80% 60% at 0% 0%, rgba(255,255,255,0.22) 0%, transparent 60%), radial-gradient(80% 60% at 100% 100%, rgba(0,0,0,0.22) 0%, transparent 60%)",
            }}
          />
          {/* Shine sweep */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.28) 50%, transparent 65%)",
              mixBlendMode: "overlay",
              animation: `giftSendShine ${isLegendary ? "2.4" : isPremium ? "2.8" : "3.4"}s ease-in-out infinite`,
            }}
          />

          {/* Sender avatar (compact 36dp) */}
          <div className="relative shrink-0">
            <Avatar className="w-9 h-9 ring-2 ring-white/30">
              <AvatarImage src={combo.senderAvatar} alt={combo.senderName} />
              <AvatarFallback className="text-[10px] font-bold">
                {combo.senderName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1">
              <LevelBadge level={combo.senderLevel} size="xs" />
            </div>
          </div>

          {/* Sender name + gift name */}
          <div className="relative flex flex-col gap-0 min-w-0 max-w-[110px]">
            <span
              className={`font-bold text-[11px] leading-tight truncate ${tier.nameText}`}
              style={{ textShadow: isLegendary ? "0 1px 2px rgba(120,53,15,0.3)" : "0 1px 2px rgba(0,0,0,0.5)" }}
            >
              {combo.senderName}
            </span>
            <span
              className={`text-[10px] leading-tight truncate ${tier.subText}`}
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
            >
              {combo.giftName}
            </span>
          </div>

          {/* Gift icon (compact) */}
          <motion.div
            className="relative flex items-center justify-center shrink-0"
            animate={{ scale: [1, 1.12, 1], rotate: [0, -4, 0, 4, 0] }}
            transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: `drop-shadow(0 4px 14px ${tier.glowColor})` }}
          >
            {combo.giftIcon ? (
              <img
                loading="lazy"
                decoding="async"
                src={combo.giftIcon}
                alt={combo.giftName}
                className="w-9 h-9 object-contain"
              />
            ) : (
              <span className="text-2xl">{combo.giftEmoji}</span>
            )}
          </motion.div>

          {/* "x N" counter — italic chrome gold with per-tap spring punch
              and Y-axis cross-fade number swap. */}
          <div className="relative shrink-0 flex items-baseline gap-0.5">
            <span
              className="text-base font-black leading-none text-white"
              style={{
                fontStyle: "italic",
                transform: "skewX(-6deg)",
                textShadow: "0 1px 2px rgba(0,0,0,0.7)",
              }}
            >
              x
            </span>
            <div className="relative inline-block min-w-[1.6em] text-center">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={`n-${count}`}
                  className="text-3xl font-black leading-none tabular-nums inline-block"
                  style={numeralStyle}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={{ duration: 0.08, ease: "easeOut" }}
                >
                  {count}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          {/* Per-tap spring punch wrapper — re-keys on milestoneTick so every
              count delta animates. */}
          <motion.div
            key={`punch-${milestoneTick}`}
            className="pointer-events-none absolute inset-0 rounded-full"
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.06, 0.98, 1] }}
            transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
          />

          {/* Milestone: spark burst (x10+) — canvas-cheap radial spokes */}
          {showSparkBurst && (
            <motion.div
              key={`spark-${milestoneTick}`}
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.75, ease: "easeOut" }}
            >
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                  animate={{
                    x: Math.cos((i * 45 * Math.PI) / 180) * (showFireRing ? 110 : 80),
                    y: Math.sin((i * 45 * Math.PI) / 180) * (showFireRing ? 110 : 80),
                    scale: [0, 1.6, 0],
                    opacity: [1, 1, 0],
                  }}
                  transition={{ duration: 0.7, ease: "easeOut", delay: i * 0.015 }}
                  style={{
                    left: "70%",
                    top: "50%",
                    width: i % 2 === 0 ? 7 : 4,
                    height: i % 2 === 0 ? 7 : 4,
                    background: tier.sparkleColor,
                    boxShadow: `0 0 10px ${tier.sparkleColor}, 0 0 22px ${tier.glowColor}`,
                  }}
                />
              ))}
            </motion.div>
          )}

          {/* Milestone: fire ring (x50+) — expanding ring */}
          {showFireRing && (
            <motion.div
              key={`ring-${milestoneTick}`}
              className="pointer-events-none absolute rounded-full"
              initial={{ scale: 0, opacity: 0.95 }}
              animate={{ scale: 4.5, opacity: 0 }}
              transition={{ duration: 0.65, ease: "easeOut" }}
              style={{
                left: "70%",
                top: "50%",
                width: 50,
                height: 50,
                marginLeft: -25,
                marginTop: -25,
                border: `2.5px solid ${tier.sparkleColor}`,
                boxShadow: `0 0 22px ${tier.glowColor}, inset 0 0 14px ${tier.sparkleColor}`,
              }}
            />
          )}
        </motion.div>

        {/* Milestone: full-frame white flash (x99/x100) — sits OUTSIDE the pill
            so it can wash a wider radius without clipping. */}
        {showFullFlash && (
          <motion.div
            key={`flash-${milestoneTick}`}
            className="pointer-events-none fixed inset-0 z-[55] bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.45, 0] }}
            transition={{ duration: 0.32, ease: "easeOut", times: [0, 0.3, 1] }}
          />
        )}

        {/* Receiver chip — small label, only on premium+ */}
        {isPremium && (
          <div
            className="absolute -bottom-1.5 left-12 px-1.5 py-0.5 rounded-full text-[8px] font-bold"
            style={{
              background: "rgba(0,0,0,0.6)",
              color: tier.receiverText.includes("pink") ? "#fbcfe8" : "#fde68a",
              border: "1px solid rgba(255,255,255,0.15)",
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
          >
            → {combo.receiverName}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

// Mini gift notification — unchanged, used by other surfaces.
export const MiniGiftNotification = ({
  senderName,
  giftEmoji,
  giftName,
  count,
}: {
  senderName: string;
  giftEmoji: string;
  giftName: string;
  count: number;
}) => (
  <motion.div
    initial={{ x: 100, opacity: 0, scale: 0.94 }}
    animate={{ x: 0, opacity: 1, scale: 1 }}
    exit={{ x: 100, opacity: 0, scale: 0.94 }}
    transition={{ type: "spring", damping: 22, stiffness: 360 }}
    className="relative flex items-center gap-2 px-3 py-2 rounded-xl overflow-hidden"
    style={{
      background: "linear-gradient(135deg, rgba(15,23,42,0.7) 0%, rgba(30,27,75,0.7) 100%)",
      backdropFilter: "blur(12px) saturate(140%)",
      WebkitBackdropFilter: "blur(12px) saturate(140%)",
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "0 6px 18px -6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
    }}
  >
    <span
      className="text-white/85 text-xs font-medium truncate max-w-[80px]"
      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
    >
      {senderName}
    </span>
    <span className="text-lg" style={{ filter: "drop-shadow(0 2px 4px rgba(251,191,36,0.5))" }}>
      {giftEmoji}
    </span>
    {count > 1 && (
      <span
        className="text-amber-300 font-extrabold text-sm tabular-nums"
        style={{ textShadow: "0 0 8px rgba(251,191,36,0.5)" }}
      >
        x{count}
      </span>
    )}
  </motion.div>
);

export default GiftComboDisplay;
