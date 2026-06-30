import React, { useEffect, useState, useCallback, memo, forwardRef, useRef, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
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
  /** True if the current viewer SENT this gift */
  isOwnGift?: boolean;
  /** True if the current viewer is the RECEIVER (host) */
  isReceiverGift?: boolean;
  /** Optional explicit beans amount (overrides client-side calculation) */
  beansEarned?: number;
  /** Bumped on every combo merge — drives count-up retrigger + dismiss-timer reset */
  comboKey?: number;
}

interface FlyingGiftAnimationProps {
  gift: FlyingGift;
  onComplete: () => void;
  /**
   * Stack position (0 = bottom-most, 1 = above, 2 = above that, ...).
   * Each level shifts the capsule up by STACK_OFFSET_PX so concurrent gifts
   * appear as a vertical stack (Bigo / Chamet behaviour) instead of overlapping
   * on the same line. Pass `index` from your `.map((gift, index) => ...)`.
   * Defaults to 0 for legacy callers — fully backwards compatible.
   */
  stackIndex?: number;
}

// Vertical gap between two stacked capsules. Capsule height is ~36px so
// 44px leaves a 8px gutter — visually clean and matches Bigo/Chamet spacing.
const STACK_OFFSET_PX = 44;
// Hard cap visible stack. Anything beyond renders off-screen-ish but the
// underlying queue (useFlyingGifts) keeps merging combos so this is rare.
const MAX_VISIBLE_STACK = 3;

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
//
// PROFESSIONAL FIFO QUEUE (Bigo / Chamet / TikTok Live behavior):
//  - Only ONE heavy fullscreen (SVGA/VAP/MP4/PAG/Lottie) renders at a time.
//  - New gifts WAIT in a FIFO queue — they do NOT preempt the current owner,
//    so every heavy gift plays its FULL native duration end-to-end.
//  - When the active owner releases (native onComplete or 12s safety),
//    the next waiting gift is granted the slot via a "grant" event.
//  - Queue cap = 6: beyond that, the OLDEST waiter is dropped (its capsule
//    still flies, just no full-screen) to keep delivery instant under burst.
//  - 12s hard safety: if a player wedges and never fires onComplete, the
//    slot is force-released so the queue never deadlocks.
// ============================================================
let activeFullscreenOwner: string | null = null;
let activeFullscreenSince = 0;
const fullscreenWaiters: string[] = [];
const FULLSCREEN_MAX_QUEUE = 6;
const FULLSCREEN_SAFETY_MS = 12000;
const FULLSCREEN_GRANT_EVENT = 'meri-fullscreen-gift-grant';
const FULLSCREEN_PREEMPT_EVENT = 'meri-fullscreen-gift-preempt';

const emitGrant = (nextId: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FULLSCREEN_GRANT_EVENT, { detail: { nextId } }));
};

const emitPreempt = (previousId: string, nextId: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FULLSCREEN_PREEMPT_EVENT, { detail: { previousId, nextId } }));
};

/** Try to acquire the fullscreen slot.
 *  Returns true if granted immediately, false if queued. */
const tryAcquireFullscreen = (id: string): boolean => {
  // Safety: if owner has held the slot >12s (wedged player), force release.
  if (activeFullscreenOwner && Date.now() - activeFullscreenSince > FULLSCREEN_SAFETY_MS) {
    const stale = activeFullscreenOwner;
    activeFullscreenOwner = null;
    emitPreempt(stale, id);
  }

  if (activeFullscreenOwner === null || activeFullscreenOwner === id) {
    activeFullscreenOwner = id;
    activeFullscreenSince = Date.now();
    return true;
  }

  // Already waiting? no-op.
  if (fullscreenWaiters.includes(id)) return false;

  // Cap queue: drop OLDEST waiter to keep memory bounded under burst sends.
  if (fullscreenWaiters.length >= FULLSCREEN_MAX_QUEUE) {
    const dropped = fullscreenWaiters.shift()!;
    emitPreempt(dropped, id);
  }
  fullscreenWaiters.push(id);
  return false;
};

const releaseFullscreen = (id: string) => {
  // Owner releasing → promote next waiter.
  if (activeFullscreenOwner === id) {
    activeFullscreenOwner = null;
    activeFullscreenSince = 0;
    const next = fullscreenWaiters.shift();
    if (next) {
      activeFullscreenOwner = next;
      activeFullscreenSince = Date.now();
      emitGrant(next);
    }
    return;
  }
  // Waiter cancelling before its turn → just remove from queue.
  const idx = fullscreenWaiters.indexOf(id);
  if (idx >= 0) fullscreenWaiters.splice(idx, 1);
};



// ============================================================
// BIGO LIVE / CHAMET STYLE GIFT BANNER
// Professional 2-row layout with gift icon + combo counter
// ============================================================
const FlyingGiftAnimationInner = memo(({ gift, onComplete, stackIndex = 0 }: FlyingGiftAnimationProps) => {
  const [currentCount, setCurrentCount] = useState(0);
  const [showFullScreen, setShowFullScreen] = useState(true);
  const [animationEnded, setAnimationEnded] = useState(false);
  const [svgaError, setSvgaError] = useState(false);
  const mountedRef = useRef(true);
  const completedRef = useRef(false);
  const animationStartedRef = useRef(false);

  const displayAnimationUrl = useMemo(() => gift.animationUrl || gift.giftImageUrl, [gift.animationUrl, gift.giftImageUrl]);
  const animationType = useMemo(() => getAnimationType(displayAnimationUrl, gift.animationFormat), [displayAnimationUrl, gift.animationFormat]);
  const isSVGA = animationType === 'svga' && !svgaError;
  const completesFromPlayer = !!displayAnimationUrl && animationType !== 'image' && !svgaError;
  const needsFullscreenSlot = completesFromPlayer;
  const isPremium = gift.coins >= 10000;
  const isLuxury = gift.coins >= 1000;
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
  }, [isSVGA, gift.soundUrl, hasFullscreenSlot, gift.giftName]);
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
          className="h-[34px] w-[34px] object-contain"
          style={{ filter: 'drop-shadow(0 3px 5px rgba(22, 23, 48, 0.28))' }}
          initial={{ scale: 0.72, rotate: -6, opacity: 0 }}
          animate={{ scale: [0.72, 1.08, 1], rotate: [0, 3, 0], opacity: 1 }}
          transition={{ duration: 0.32, ease: "easeOut", delay: 0.08 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    }
    return (
      <motion.span
        className="text-[28px] leading-none"
        style={{ filter: 'drop-shadow(0 3px 5px rgba(22, 23, 48, 0.28))' }}
        initial={{ scale: 0.72, opacity: 0 }}
        animate={{ scale: [0.72, 1.08, 1], opacity: 1 }}
        transition={{ duration: 0.28, delay: 0.08 }}
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
  // PROFESSIONAL FLYING GIFT CAPSULE
  // Compact two-line Chamet/BIGO-style banner shared by DM / Live /
  // Party / Private Call / Profile. Soft premium color, no bulky
  // value badge, no oversized gift icon, no harsh neon tier blocks.
  // ============================================================
  const tier: 'premium' | 'luxury' | 'standard' = isPremium ? 'premium' : isLuxury ? 'luxury' : 'standard';
  const tierStyles = {
    premium: {
      background: 'linear-gradient(90deg, rgba(44,55,186,0.96) 0%, rgba(92,99,224,0.92) 45%, rgba(176,190,255,0.55) 82%, rgba(255,255,255,0.18) 100%)',
      border: 'rgba(246, 221, 133, 0.44)',
      avatarRing: 'rgba(246, 221, 133, 0.82)',
      count: '#fff0a6',
      countShadow: '0 1px 5px rgba(89, 63, 9, 0.35)',
      glow: '0 7px 18px rgba(50, 54, 168, 0.28), inset 0 1px 0 rgba(255,255,255,0.28)',
    },
    luxury: {
      background: 'linear-gradient(90deg, rgba(45,67,194,0.95) 0%, rgba(106,110,222,0.9) 48%, rgba(185,196,255,0.48) 84%, rgba(255,255,255,0.16) 100%)',
      border: 'rgba(203, 213, 255, 0.38)',
      avatarRing: 'rgba(205, 214, 255, 0.72)',
      count: '#f3e9ff',
      countShadow: '0 1px 5px rgba(45, 36, 102, 0.36)',
      glow: '0 7px 16px rgba(55, 65, 185, 0.24), inset 0 1px 0 rgba(255,255,255,0.24)',
    },
    standard: {
      background: 'linear-gradient(90deg, rgba(48,72,196,0.94) 0%, rgba(99,111,220,0.88) 50%, rgba(190,200,255,0.44) 84%, rgba(255,255,255,0.14) 100%)',
      border: 'rgba(204, 214, 255, 0.32)',
      avatarRing: 'rgba(216, 223, 255, 0.64)',
      count: '#ffffff',
      countShadow: '0 1px 5px rgba(40, 50, 128, 0.34)',
      glow: '0 6px 14px rgba(54, 72, 174, 0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
    },
  }[tier];
  const displayedCount = Math.max(1, currentCount || gift.count || 1);

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

      {/* ======= UNIFIED PROFESSIONAL FLYING GIFT CAPSULE =======
          Stacked vertically when multiple gifts are active simultaneously.
          `stackIndex` is supplied by the caller's .map((g, i) => ...) so
          concurrent capsules appear above each other (Bigo / Chamet style)
          instead of overlapping at the same bottom position. */}
      <motion.div
        className="absolute left-2 will-change-transform"
        style={{
          bottom: `calc(22% + ${Math.min(stackIndex, MAX_VISIBLE_STACK - 1) * STACK_OFFSET_PX}px)`,
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
        initial={{ x: -276, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -230, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 360, mass: 0.68 }}
      >
        <div
          className="relative flex items-center rounded-full overflow-visible"
          style={{
            width: 'clamp(224px, 63vw, 264px)',
            minHeight: 36,
            padding: '2px 7px 2px 2px',
            background: tierStyles.background,
            boxShadow: tierStyles.glow,
            border: `1px solid ${tierStyles.border}`,
          }}
        >
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.06) 48%, rgba(25,30,118,0.08) 100%)',
            }}
          />

          {/* Sender avatar + equipped frame (level / VIP / shop frame).
              AvatarWithFrame auto-loads the user's active frame from userId.
              Falls back to a plain ringed avatar if userId is missing. */}
          <div className="relative flex-shrink-0 z-10">
            {gift.senderId ? (
              <AvatarWithFrame
                userId={gift.senderId}
                src={gift.senderAvatar || undefined}
                name={gift.senderName}
                size="xs"
                showFrame
                showAnimation
              />
            ) : gift.senderAvatar ? (
              <img
                loading="lazy"
                decoding="async"
                src={gift.senderAvatar}
                alt=""
                className="h-8 w-8 rounded-full border-2 object-cover"
                style={{ borderColor: tierStyles.avatarRing, boxShadow: '0 2px 7px rgba(19, 25, 91, 0.3)' }}
              />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 text-[12px] font-bold"
                style={{
                  borderColor: tierStyles.avatarRing,
                  color: '#ffffff',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
                  boxShadow: '0 2px 7px rgba(19, 25, 91, 0.3)',
                }}
              >
                {gift.senderName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Two-line professional copy */}
          <div className="relative z-10 ml-1.5 min-w-0 flex-1 leading-none">
            <div
              className="truncate text-[12px] font-semibold"
              style={{ color: '#ffffff', textShadow: '0 1px 3px rgba(20, 27, 92, 0.32)' }}
            >
              {gift.senderName}
            </div>
            <div
              className="mt-1 truncate text-[10px] font-medium"
              style={{ color: 'rgba(255,255,255,0.78)', textShadow: '0 1px 2px rgba(20, 27, 92, 0.22)' }}
            >
              🎁 to {gift.receiverName || gift.giftName}
            </div>
          </div>

          {/* Gift icon */}
          <div className="relative z-10 ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center">
            {renderBannerGiftIcon()}
          </div>

          {/* Combo counter — small, premium, non-blocking */}
          <motion.div
            key={displayedCount}
            className="relative z-10 ml-0.5 flex-shrink-0 will-change-transform"
            initial={{ scale: 1.36, opacity: 0.75, y: -3 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 360, mass: 0.55 }}
          >
            <span
              className="block min-w-[24px] text-right text-[18px] font-black italic leading-none"
              style={{
                color: tierStyles.count,
                textShadow: tierStyles.countShadow,
                WebkitTextStroke: '0.35px rgba(255,255,255,0.25)',
              }}
            >
              x{displayedCount}
            </span>
          </motion.div>
        </div>
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
