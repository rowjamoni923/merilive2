import React, { useEffect, useState, useCallback, memo, forwardRef, useRef, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useHostGiftPercent } from "@/hooks/useHostGiftPercent";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";
import { playSoundUrl } from "@/utils/soundPlayer";
import { detectProfessionalAnimationFormat } from "@/utils/animationFormat";


export interface FlyingGift {
  id: string;
  senderId?: string;
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
  animationFormat?: string | null;
  animationConfigUrl?: string | null;
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

const getAnimationType = (url?: string, format?: string | null): 'svga' | 'lottie' | 'pag' | 'vap' | 'video' | 'image' | null => {
  if (!url) return null;
  const detected = detectProfessionalAnimationFormat(url, format);
  if (detected === 'svga' || detected === 'lottie' || detected === 'pag' || detected === 'vap') return detected;
  if (detected === 'mp4' || detected === 'webm') return 'video';
  if (detected === 'gif' || detected === 'webp' || detected === 'png' || detected === 'static') return 'image';
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.svga')) return 'svga';
  if (cleanUrl.endsWith('.pag')) return 'pag';
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
// FULLSCREEN HEAVY-ANIMATION ARBITER (module-level singleton)
// Guarantees only ONE fullscreen SVGA/VAP/MP4/PAG/Lottie plays at any moment,
// but NEVER queues a later gift behind a 10–15s animation. New gifts preempt
// the current full-screen owner so delivery remains zero-second and the WebView
// never renders stacked heavy players.
// ============================================================
let activeFullscreenOwner: string | null = null;
const FULLSCREEN_PREEMPT_EVENT = 'meri-fullscreen-gift-preempt';

const tryAcquireFullscreen = (id: string): boolean => {
  if (activeFullscreenOwner === null || activeFullscreenOwner === id) {
    activeFullscreenOwner = id;
    return true;
  }
  const previousId = activeFullscreenOwner;
  activeFullscreenOwner = id;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FULLSCREEN_PREEMPT_EVENT, { detail: { previousId, nextId: id } }));
  }
  return true;
};

const releaseFullscreen = (id: string) => {
  if (activeFullscreenOwner !== id) return;
  activeFullscreenOwner = null;
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
  const mountedRef = useRef(true);
  const completedRef = useRef(false);
  const animationStartedRef = useRef(false);
  const hostPercent = useHostGiftPercent();

  const displayAnimationUrl = useMemo(() => gift.animationUrl || gift.giftImageUrl, [gift.animationUrl, gift.giftImageUrl]);
  const animationType = useMemo(() => getAnimationType(displayAnimationUrl, gift.animationFormat), [displayAnimationUrl, gift.animationFormat]);
  const isSVGA = animationType === 'svga' && !svgaError;
  const completesFromPlayer = !!displayAnimationUrl && animationType !== 'image' && !svgaError;
  const needsFullscreenSlot = completesFromPlayer;
  const isPremium = gift.coins >= 10000;
  const isLuxury = gift.coins >= 1000;

  // Diamonds spent (sender view) and beans earned (receiver view)
  const totalDiamonds = gift.coins * gift.count;
  const totalBeans = useMemo(() => {
    if (typeof gift.beansEarned === 'number') return gift.beansEarned;
    return Math.floor(totalDiamonds * hostPercent / 100);
  }, [gift.beansEarned, totalDiamonds, hostPercent]);


  const [hasFullscreenSlot, setHasFullscreenSlot] = useState(false);
  const soundPlayedRef = useRef(false);

  // Sound logic: Plays only when the animation actually starts (owns the slot)
  // to ensure 100% synchronization between audio and video.
  useEffect(() => {
    if (soundPlayedRef.current || !hasFullscreenSlot) return;
    if (!gift.soundUrl) return;
    
    // SVGAPlayerWithAudio handles its own internal/fallback sound for SVGA.
    // For VAP/Video/Images, we play the sound here only once the player is mounted.
    if (isSVGA) return;
    
    soundPlayedRef.current = true;
    console.log('[GiftAnim] 🔊 Playing sound for:', gift.giftName);
    playSoundUrl(gift.soundUrl, { volume: 0.8, maxConcurrent: 2 });
  }, [isSVGA, gift.soundUrl, hasFullscreenSlot]);
  const handleAnimationComplete = useCallback(() => {
    if (completedRef.current || !mountedRef.current) return;
    completedRef.current = true;
    setShowFullScreen(false);
    setAnimationEnded(true);
    releaseFullscreen(gift.id);
    onComplete();
  }, [onComplete, gift.id]);


  const handleSvgaError = useCallback((error: Error) => {
    console.warn('[GiftAnim] SVGA error:', gift.giftName, error);
    setSvgaError(true);
    setTimeout(() => {
      if (mountedRef.current && !completedRef.current) handleAnimationComplete();
    }, 3500);
  }, [gift.giftName, handleAnimationComplete]);

  useEffect(() => {
    if (!needsFullscreenSlot || typeof window === 'undefined') return;
    const onPreempt = (event: Event) => {
      const detail = (event as CustomEvent<{ previousId?: string; nextId?: string }>).detail;
      if (detail?.previousId === gift.id && detail.nextId !== gift.id) handleAnimationComplete();
    };
    window.addEventListener(FULLSCREEN_PREEMPT_EVENT, onPreempt as EventListener);
    return () => window.removeEventListener(FULLSCREEN_PREEMPT_EVENT, onPreempt as EventListener);
  }, [gift.id, needsFullscreenSlot, handleAnimationComplete]);

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

    if (completesFromPlayer) {
      // Animated media path: NO fixed timer. SVGA/VAP/PAG/Lottie/MP4/WebM
      // complete from their own native end callbacks only.
      animationStartedRef.current = true;
      return () => { mountedRef.current = false; };
    }

    // Non-SVGA: show pill for 1.8s (Chamet/Bigo unified spec) — RESET on every combo bump
    completedRef.current = false;
    const timer = setTimeout(() => {
      if (mountedRef.current && !completedRef.current) handleAnimationComplete();
    }, 1800);
    return () => { mountedRef.current = false; clearTimeout(timer); };
  }, [gift.comboKey, completesFromPlayer, handleAnimationComplete]);

  // ============================================================
  // FULLSCREEN HEAVY ANIMATION SLOT ACQUISITION
  // Only ONE heavy fullscreen can render at a time. If another one is
  // already playing, this gift waits in FIFO queue. The SVGA player is
  // NOT mounted until the slot is owned — so the native duration only
  // starts counting at its actual play time (no silent pre-consumption).
  // ============================================================
  useEffect(() => {
    if (!needsFullscreenSlot || svgaError) {
      // Lightweight/static gifts don't compete for the singleton slot.
      setHasFullscreenSlot(true);
      return;
    }
    tryAcquireFullscreen(gift.id);
    setHasFullscreenSlot(true);
    return () => {
      releaseFullscreen(gift.id);
    };
  }, [needsFullscreenSlot, svgaError, gift.id]);


  // Get gift icon URL (prefer giftImageUrl over giftIcon)
  const giftIconSrc = gift.giftImageUrl || (/^(https?:\/\/|\/)/i.test(gift.giftIcon || '') ? gift.giftIcon : null);

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
    // Heavy gifts wait their turn — only render when this instance owns the slot.
    if (needsFullscreenSlot && !hasFullscreenSlot) return null;


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
              type={animationType === 'vap' ? 'vap' : isSVGA ? 'svga' : animationType === 'lottie' ? 'lottie' : animationType === 'pag' ? 'pag' : animationType === 'video' ? 'mp4' : undefined}
              configSrc={gift.animationConfigUrl || undefined}
              loop={false}
              // VAP/MP4/WebM must ALWAYS be muted for reliable autoplay on
              // mobile/WebView; their sound is played separately by soundUrl.
              // Leaving VAP unmuted when soundUrl is empty blocks playback.
              muted={isSVGA ? false : true}
              volume={0.8}
              soundUrl={gift.soundUrl}
              triggerKey={gift.comboKey}
              onComplete={completesFromPlayer ? handleAnimationComplete : undefined}
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

  // ============================================================
  // UNIFIED PILL — single-row, full-rounded
  // Tier ladder: GOLD (≥10k) / TEAL (≥1k) / ROSE (default)
  // Same look in DM, Live, Party, Call — Chamet/Bigo/Olamet parity
  // ============================================================
  const tier: 'gold' | 'teal' | 'rose' = isPremium ? 'gold' : isLuxury ? 'teal' : 'rose';
  const tierStyles = {
    gold: {
      bg: 'linear-gradient(90deg, rgba(180,120,20,0.95) 0%, rgba(234,179,8,0.92) 45%, rgba(253,224,71,0.88) 100%)',
      ring: 'rgba(253,224,71,0.65)',
      glow: '0 8px 24px rgba(234,179,8,0.45), 0 2px 8px rgba(0,0,0,0.4)',
      countFrom: 'from-amber-100',
      countVia: 'via-yellow-300',
      countTo: 'to-orange-400',
      countShadow: '0 0 14px rgba(255,200,0,0.7)',
      giftName: 'text-amber-100',
    },
    teal: {
      bg: 'linear-gradient(90deg, rgba(15,118,110,0.95) 0%, rgba(20,184,166,0.92) 45%, rgba(94,234,212,0.88) 100%)',
      ring: 'rgba(94,234,212,0.6)',
      glow: '0 8px 24px rgba(20,184,166,0.45), 0 2px 8px rgba(0,0,0,0.4)',
      countFrom: 'from-cyan-100',
      countVia: 'via-teal-200',
      countTo: 'to-emerald-300',
      countShadow: '0 0 12px rgba(94,234,212,0.7)',
      giftName: 'text-cyan-100',
    },
    rose: {
      bg: 'linear-gradient(90deg, rgba(159,18,57,0.95) 0%, rgba(225,29,72,0.92) 45%, rgba(251,113,133,0.88) 100%)',
      ring: 'rgba(251,113,133,0.6)',
      glow: '0 8px 22px rgba(225,29,72,0.4), 0 2px 8px rgba(0,0,0,0.4)',
      countFrom: 'from-rose-100',
      countVia: 'via-pink-200',
      countTo: 'to-rose-300',
      countShadow: '0 0 12px rgba(251,113,133,0.7)',
      giftName: 'text-rose-100',
    },
  }[tier];

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

      {/* ======= UNIFIED FLYING GIFT PILL (single-row, full-rounded) ======= */}
      <motion.div
        className="absolute left-2 will-change-transform"
        style={{ bottom: '22%', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
        initial={{ x: -380, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -380, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 340, mass: 0.7 }}
      >
        <div
          className="relative flex items-center gap-2 pl-1 pr-3 py-1 rounded-full overflow-hidden backdrop-blur-xl"
          style={{
            background: tierStyles.bg,
            boxShadow: tierStyles.glow,
            border: `1px solid ${tierStyles.ring}`,
            minHeight: 44,
          }}
        >
          {/* Aurora sweep (gold/teal only) */}
          {tier !== 'rose' && (
            <motion.div
              className="absolute inset-0 pointer-events-none rounded-full"
              style={{
                background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.32) 50%, transparent 70%)',
                mixBlendMode: 'overlay',
              }}
              animate={{ x: ['-100%', '120%'] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'linear', repeatDelay: 0.3 }}
            />
          )}

          {/* Sender avatar (aviator-style ring) */}
          <div className="relative flex-shrink-0 z-10">
            {gift.senderAvatar ? (
              <img
                loading="lazy"
                decoding="async"
                src={gift.senderAvatar}
                alt=""
                className="w-9 h-9 rounded-full border-2 object-cover"
                style={{ borderColor: tierStyles.ring }}
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br from-pink-400 to-purple-500"
                style={{ borderColor: tierStyles.ring }}
              >
                {gift.senderName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Single-row text: sender · sent · [receiver?] · giftName */}
          <div className="flex items-center gap-1 min-w-0 z-10">
            <span className="text-white font-bold text-[12px] truncate max-w-[78px] drop-shadow-sm">
              {gift.senderName}
            </span>
            <span className="text-white/75 text-[10px] font-medium">sent</span>
            {gift.receiverName && (
              <span className="text-white font-semibold text-[12px] truncate max-w-[70px] drop-shadow-sm">
                {gift.receiverName}
              </span>
            )}
            <span className={cn("font-bold text-[12px] truncate max-w-[80px] drop-shadow-sm", tierStyles.giftName)}>
              {gift.giftName}
            </span>
          </div>

          {/* Gift icon */}
          <div className="flex-shrink-0 z-10">
            {renderBannerGiftIcon()}
          </div>

          {/* Combo counter — punchy bouncy xN */}
          <motion.div
            key={currentCount}
            className="flex-shrink-0 z-10 will-change-transform"
            initial={{ scale: 2.2, opacity: 0, y: -14, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: "spring", damping: 8, stiffness: 420, mass: 0.5 }}
          >
            <span
              className={cn(
                "font-black text-2xl leading-none bg-gradient-to-b bg-clip-text text-transparent",
                tierStyles.countFrom,
                tierStyles.countVia,
                tierStyles.countTo
              )}
              style={{
                WebkitTextStroke: '0.5px rgba(255,255,255,0.35)',
                textShadow: tierStyles.countShadow,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
              }}
            >
              x{currentCount}
            </span>
          </motion.div>
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
