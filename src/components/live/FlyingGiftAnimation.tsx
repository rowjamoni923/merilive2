import React, { useEffect, useState, useCallback, memo, forwardRef, useRef, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useHostGiftPercent } from "@/hooks/useHostGiftPercent";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";

export interface FlyingGift {
  id: string;
  senderName: string;
  senderAvatar?: string;
  receiverName?: string;
  giftName: string;
  giftIcon: string;
  giftImageUrl?: string;
  giftColor: string;
  count: number;
  coins: number;
  animationUrl?: string;
  soundUrl?: string;
  /** True if the current viewer SENT this gift — shows diamonds spent badge */
  isOwnGift?: boolean;
  /** True if the current viewer is the RECEIVER (host) — shows beans earned badge */
  isReceiverGift?: boolean;
  /** Optional explicit beans amount (overrides client-side calculation) */
  beansEarned?: number;
  /** Bumped on every combo merge — drives count-up retrigger + dismiss-timer reset */
  comboKey?: number;
}

interface FlyingGiftAnimationProps {
  gift: FlyingGift;
  onComplete: () => void;
}

const getAnimationType = (url?: string): 'svga' | 'lottie' | 'video' | 'image' | null => {
  if (!url) return null;
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.svga')) return 'svga';
  if (cleanUrl.endsWith('.json')) return 'lottie';
  if (cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm')) return 'video';
  if (cleanUrl.endsWith('.gif') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.jpg')) return 'image';
  return null;
};

const FULLSCREEN_GIFT_LAYER_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100dvw',
  height: '100dvh',
  minWidth: '100vw',
  minHeight: '100vh',
  zIndex: 2147483000,
  pointerEvents: 'none',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  isolation: 'isolate',
};

const FULLSCREEN_GIFT_STAGE_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100dvw',
  height: '100dvh',
  minWidth: '100vw',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// ============================================================
// FULLSCREEN SVGA SERIALIZER (module-level singleton)
// Guarantees only ONE fullscreen SVGA plays at any moment across the
// entire app. Prevents "duplicate" / overlapping plays when multiple
// gifts arrive close together (combo, multi-sender bursts). Each SVGA
// plays for its EXACT native duration (driven by the player's own
// onComplete), then the slot is released and the next queued gift
// promotes. NEVER trims an SVGA early — never extends it either.
// ============================================================
let activeFullscreenOwner: string | null = null;
const fullscreenWaiters = new Set<() => void>();

const tryAcquireFullscreen = (id: string): boolean => {
  if (activeFullscreenOwner === null || activeFullscreenOwner === id) {
    activeFullscreenOwner = id;
    return true;
  }
  return false;
};

const releaseFullscreen = (id: string) => {
  if (activeFullscreenOwner !== id) return;
  activeFullscreenOwner = null;
  const iter = fullscreenWaiters.values().next();
  if (!iter.done) {
    const next = iter.value;
    fullscreenWaiters.delete(next);
    try { next(); } catch {}
  }
};

const subscribeFullscreen = (cb: () => void): (() => void) => {
  fullscreenWaiters.add(cb);
  return () => { fullscreenWaiters.delete(cb); };
};



// ============================================================
// BIGO LIVE / CHAMET STYLE GIFT BANNER
// Professional 2-row layout with gift icon + combo counter
// ============================================================
const FlyingGiftAnimationInner = memo(({ gift, onComplete }: FlyingGiftAnimationProps) => {
  const [currentCount, setCurrentCount] = useState(0);
  const [showFullScreen, setShowFullScreen] = useState(true);
  const [animationEnded, setAnimationEnded] = useState(false);
  const [svgaError, setSvgaError] = useState(false);
  const soundPlayedRef = useRef(false);
  const mountedRef = useRef(true);
  const completedRef = useRef(false);
  const animationStartedRef = useRef(false);
  const hostPercent = useHostGiftPercent();

  const displayAnimationUrl = useMemo(() => gift.animationUrl || gift.giftImageUrl, [gift.animationUrl, gift.giftImageUrl]);
  const animationType = useMemo(() => getAnimationType(displayAnimationUrl), [displayAnimationUrl]);
  const isSVGA = animationType === 'svga' && !svgaError;
  const isPremium = gift.coins >= 10000;
  const isLuxury = gift.coins >= 1000;

  // Diamonds spent (sender view) and beans earned (receiver view)
  const totalDiamonds = gift.coins * gift.count;
  const totalBeans = useMemo(() => {
    if (typeof gift.beansEarned === 'number') return gift.beansEarned;
    return Math.floor(totalDiamonds * hostPercent / 100);
  }, [gift.beansEarned, totalDiamonds, hostPercent]);

  // Note: gift.soundUrl is now passed to SVGAPlayerWithAudio as a fallback,
  // and is also played here for non-SVGA gifts (e.g. image/video).
  useEffect(() => {
    if (soundPlayedRef.current) return;
    if (!gift.soundUrl) return;
    // Skip — SVGAPlayerWithAudio will handle sound for SVGA gifts (embedded + fallback)
    if (isSVGA) return;
    soundPlayedRef.current = true;
    const audio = new Audio(gift.soundUrl);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  }, [isSVGA, gift.soundUrl]);

  const handleAnimationComplete = useCallback(() => {
    if (completedRef.current || !mountedRef.current) return;
    completedRef.current = true;
    setShowFullScreen(false);
    setAnimationEnded(true);
    onComplete();
  }, [onComplete]);

  const handleSvgaError = useCallback((error: Error) => {
    console.warn('[GiftAnim] SVGA error:', gift.giftName, error);
    setSvgaError(true);
    setTimeout(() => {
      if (mountedRef.current && !completedRef.current) handleAnimationComplete();
    }, 3500);
  }, [gift.giftName, handleAnimationComplete]);

  // Count-up animation — re-runs on combo merge (comboKey changes)
  useEffect(() => {
    const target = gift.count;
    const duration = Math.min(600, target * 25);
    const start = performance.now();
    let rafId: number;
    const animate = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setCurrentCount(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [gift.count, gift.comboKey]);

  // Dismiss timer — SVGA uses its OWN native duration via onComplete (no fixed timer).
  // Non-SVGA banner stays 3.5s — RESETS on every combo bump.
  useEffect(() => {
    mountedRef.current = true;

    if (isSVGA && !svgaError) {
      // SVGA path: NO fixed timer. SVGAPlayerWithAudio fires onComplete at
      // the exact frames/FPS duration — that drives handleAnimationComplete.
      animationStartedRef.current = true;
      return () => { mountedRef.current = false; };
    }

    // Non-SVGA: show banner for 3.5 seconds — RESET on every combo bump
    completedRef.current = false;
    const timer = setTimeout(() => {
      if (mountedRef.current && !completedRef.current) handleAnimationComplete();
    }, 3500);
    return () => { mountedRef.current = false; clearTimeout(timer); };
  }, [gift.comboKey, isSVGA, svgaError, handleAnimationComplete]);

  // Get gift icon URL (prefer giftImageUrl over giftIcon)
  const giftIconSrc = gift.giftImageUrl || (gift.giftIcon?.startsWith('http') ? gift.giftIcon : null);

  // Render gift icon in banner
  const renderBannerGiftIcon = () => {
    if (giftIconSrc) {
      return (
        <motion.img
          src={giftIconSrc}
          alt={gift.giftName}
          className="w-12 h-12 object-contain drop-shadow-lg"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: [0, 1.3, 1], rotate: [0, 10, 0] }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    }
    return (
      <motion.span
        className="text-4xl drop-shadow-lg"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.3, 1] }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        {gift.giftIcon || '🎁'}
      </motion.span>
    );
  };

  // Full-screen gift animation — every gift occupies the complete app viewport.
  const renderFullScreen = () => {
    if (!showFullScreen || animationEnded) return null;

    if (displayAnimationUrl) {
      return (
        <motion.div
          key={`fullscreen-${displayAnimationUrl}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={FULLSCREEN_GIFT_LAYER_STYLE}
        >
          <div style={FULLSCREEN_GIFT_STAGE_STYLE}>
            <FixedAnimationFrame
              src={displayAnimationUrl}
              size="fullscreen"
              width="100dvw"
              height="100dvh"
              type={isSVGA ? 'svga' : undefined}
              loop={false}
              muted={!isSVGA}
              volume={0.8}
              soundUrl={gift.soundUrl}
              onComplete={isSVGA ? handleAnimationComplete : undefined}
              onError={handleSvgaError}
              center
            />
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        key="emoji-fullscreen"
        initial={{ opacity: 0, scale: 0.2, rotate: -14 }}
        animate={{ opacity: 1, scale: [0.2, 1.08, 1], rotate: [0, 8, 0] }}
        exit={{ opacity: 0, scale: 0.86 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        style={FULLSCREEN_GIFT_LAYER_STYLE}
      >
        <span className="drop-shadow-2xl text-[clamp(8rem,45vmin,22rem)]">
          {gift.giftIcon || '🎁'}
        </span>
      </motion.div>
    );
  };

  // Banner gradient based on gift value (Bigo style)
  const bannerBg = isPremium
    ? 'bg-gradient-to-r from-amber-600/95 via-orange-500/90 to-yellow-500/50'
    : isLuxury
    ? 'bg-gradient-to-r from-purple-600/95 via-pink-500/90 to-rose-400/50'
    : 'bg-gradient-to-r from-blue-600/90 via-indigo-500/85 to-purple-400/50';

  // CRITICAL: portal to <body> — ancestor transforms (framer-motion / scroll
  // containers in LiveStream/PartyRoom/ActiveCall) would otherwise pin
  // position:fixed inside a parent and break true fullscreen.
  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  return createPortal(
    <div
      className="pointer-events-none"
      style={{ position: 'fixed', inset: 0, width: '100dvw', height: '100dvh', minWidth: '100vw', minHeight: '100vh', zIndex: 2147483000, pointerEvents: 'none', overflow: 'hidden', isolation: 'isolate' }}
    >
      {/* Full-screen animation */}
      <AnimatePresence mode="wait">{renderFullScreen()}</AnimatePresence>

      {/* ======= BIGO/CHAMET STYLE GIFT BANNER ======= */}
      {/* Left-side banner: [Avatar] [Name / sent GiftName] [GiftIcon] [xCount] */}
      <motion.div
        className="absolute left-0 will-change-transform"
        style={{ bottom: '22%', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
        initial={{ x: -360, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -360, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 340, mass: 0.7 }}
      >
        <div className={cn(
          "flex items-center gap-0 rounded-r-full overflow-hidden relative",
          "backdrop-blur-xl shadow-2xl",
          "border border-white/25"
        )}
          style={{ boxShadow: isPremium
            ? '0 12px 32px rgba(251,191,36,0.45), 0 4px 12px rgba(0,0,0,0.4)'
            : isLuxury
            ? '0 12px 32px rgba(168,85,247,0.4), 0 4px 12px rgba(0,0,0,0.4)'
            : '0 10px 28px rgba(99,102,241,0.35), 0 4px 12px rgba(0,0,0,0.4)' }}
        >
          {/* Aurora sweep overlay (premium/luxury only) */}
          {(isPremium || isLuxury) && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
                mixBlendMode: 'overlay',
              }}
              animate={{ x: ['-100%', '120%'] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'linear', repeatDelay: 0.4 }}
            />
          )}
          {/* Left section: avatar + text with colored bg */}
          <div className={cn(
            "flex items-center gap-2 pl-2 pr-3 py-2 relative",
            bannerBg
          )}>
            {/* Sender Avatar */}
            <div className="relative flex-shrink-0">
              {gift.senderAvatar ? (
                <img
                  src={gift.senderAvatar}
                  alt=""
                  className="w-9 h-9 rounded-full border-2 border-white/60 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full border-2 border-white/60 flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br from-pink-400 to-purple-500">
                  {gift.senderName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Two-row text: Name / sent GiftName */}
            <div className="flex flex-col min-w-0 leading-tight">
              <span className="text-white font-bold text-xs truncate max-w-[80px] drop-shadow-sm">
                {gift.senderName}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-white/70 text-[10px]">sent</span>
                <span className="text-amber-200 font-semibold text-[11px] truncate max-w-[65px]">
                  {gift.giftName}
                </span>
              </div>
            </div>
          </div>

          {/* Right section: gift icon on semi-transparent bg */}
          <div className="flex items-center gap-1 px-2 py-1 bg-black/40">
            {renderBannerGiftIcon()}

            {/* Combo counter - punchy bouncy number (Bigo-parity) */}
            <motion.div
              key={currentCount}
              className="flex flex-col items-center ml-1 will-change-transform"
              initial={{ scale: 2.2, opacity: 0, y: -14, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
              transition={{ type: "spring", damping: 8, stiffness: 420, mass: 0.5 }}
            >
              <span className={cn(
                "font-black text-2xl leading-none",
                isPremium
                  ? "bg-gradient-to-b from-amber-200 via-yellow-300 to-orange-400 bg-clip-text text-transparent"
                  : "bg-gradient-to-b from-white via-pink-100 to-pink-300 bg-clip-text text-transparent"
              )} style={{
                WebkitTextStroke: '0.5px rgba(255,255,255,0.3)',
                textShadow: isPremium ? '0 0 20px rgba(255,200,0,0.6)' : '0 0 12px rgba(255,255,255,0.4)',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
              }}>
                x{currentCount}
              </span>
            </motion.div>
          </div>
        </div>

        {/* Personal value badge: sender sees diamonds spent, receiver sees beans earned.
            Hidden for everyone else so spectators don't see private settlement values. */}
        {(gift.isOwnGift || gift.isReceiverGift) && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.25, type: 'spring', damping: 14, stiffness: 280 }}
            className="mt-1.5 ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/20 bg-black/55 shadow-lg"
          >
            {gift.isOwnGift ? (
              <>
                <span className="text-[13px] leading-none">💎</span>
                <span className="text-cyan-200 font-bold text-[11px] leading-none">
                  -{totalDiamonds.toLocaleString()}
                </span>
                <span className="text-white/60 text-[9px] leading-none ml-0.5">spent</span>
              </>
            ) : (
              <>
                <span className="text-[13px] leading-none">🫘</span>
                <span className="text-emerald-200 font-bold text-[11px] leading-none">
                  +{totalBeans.toLocaleString()}
                </span>
                <span className="text-white/60 text-[9px] leading-none ml-0.5">earned</span>
              </>
            )}
          </motion.div>
        )}

        {/* Sparkle trail — premium (6 particles, varied tracks) */}
        {isPremium && (
          <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: i % 2 === 0 ? 6 : 4,
                  height: i % 2 === 0 ? 6 : 4,
                  background: i % 3 === 0 ? '#fde047' : i % 3 === 1 ? '#fbbf24' : '#fed7aa',
                  boxShadow: '0 0 8px rgba(251,191,36,0.8)',
                  top: (i - 3) * 4,
                }}
                animate={{
                  x: [0, 32 + i * 6],
                  y: [0, (i % 2 === 0 ? -1 : 1) * (4 + i)],
                  opacity: [1, 0],
                  scale: [1, 0.2],
                }}
                transition={{ duration: 0.85, delay: i * 0.08, repeat: Infinity, repeatDelay: 0.6, ease: 'easeOut' }}
              />
            ))}
          </div>
        )}
        {/* Luxury (non-premium) — pink/purple sparkle trail */}
        {!isPremium && isLuxury && (
          <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1.5 h-1.5 rounded-full"
                style={{ background: i % 2 === 0 ? '#f0abfc' : '#e9d5ff', boxShadow: '0 0 6px rgba(236,72,153,0.7)' }}
                animate={{ x: [0, 24 + i * 7], opacity: [1, 0], scale: [1, 0.25] }}
                transition={{ duration: 0.8, delay: i * 0.1, repeat: Infinity, repeatDelay: 0.7 }}
              />
            ))}
          </div>
        )}
      </motion.div>
    </div>,
    portalTarget
  );
});

FlyingGiftAnimationInner.displayName = 'FlyingGiftAnimationInner';

export const FlyingGiftAnimation = forwardRef<HTMLDivElement, FlyingGiftAnimationProps>(
  (props, ref) => <FlyingGiftAnimationInner {...props} />
);

export default FlyingGiftAnimation;
