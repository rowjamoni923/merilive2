import { useState, useRef, useCallback, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getLevelBadgeBg,
  getLevelTextColor,
  ensureValidLevel,
  formatLevel,
} from "@/features/shared/level";
import EntryAnimationFrame from "@/components/entry/EntryAnimationFrame";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";
import { svgaCacheHas } from "@/utils/svgaCache";
import { prewarmPopularAssets, prewarmSVGA } from "@/utils/svgaPrewarm";


const getNameBarAnimationType = (url?: string): 'svga' | 'vap' | 'gif' | 'image' | null => {
  if (!url) return null;
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.svga')) return 'svga';
  if (cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov')) return 'vap';
  if (cleanUrl.endsWith('.gif')) return 'gif';
  if (cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) return 'image';
  return null;
};

interface EntryNameBarAnimationProps {
  userName: string;
  userLevel: number;
  avatarUrl?: string;
  animationUrl?: string;
  /** When provided, renders the user's equipped avatar frame (professional parity). */
  userId?: string;
  onComplete?: () => void;
  className?: string;
  bottomPosition?: string;
}


/**
 * Entry Name Bar Animation - Professional Sliding Banner (Chamet/BIGO parity)
 *
 * SYNC FIX (2026-06-18): Removed the artificial 350ms "name-in" phase that
 * caused SVGA to pop in late after the name. Now:
 *   1. 'preparing' — silently wait until SVGA binary is parsed & cached (max 600ms
 *      grace, then proceed regardless). GIF/static use Image preload. No banner
 *      is visible during this phase.
 *   2. 'animating' — banner slides in with the SVGA layer + name overlay mounted
 *      together as one composited unit, frame-synced from the first frame.
 *   3. 'exiting'   — whole composite slides out.
 *   4. 'done'      — unmounted.
 */
const EntryNameBarAnimationInner = memo(({
  userName,
  userLevel,
  avatarUrl,
  animationUrl,
  userId,
  onComplete,
  className,
  bottomPosition = '12%',
}: EntryNameBarAnimationProps) => {

  const [phase, setPhase] = useState<'preparing' | 'animating' | 'exiting' | 'done'>('preparing');
  const level = ensureValidLevel(userLevel);
  const completedRef = useRef(false);
  const mountedRef = useRef(true);

  // CRITICAL FIX: Store onComplete in ref to prevent timer reset on parent re-renders
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Detect animation type
  const cleanAnimUrl = animationUrl && animationUrl.trim().length > 0 ? animationUrl : undefined;
  const animType = getNameBarAnimationType(cleanAnimUrl);
  const hasSvga = animType === 'svga';
  const hasGifOrImage = animType === 'gif' || animType === 'image';
  const hasAnimation = hasSvga || hasGifOrImage;

  const triggerExit = useCallback(() => {
    if (completedRef.current || !mountedRef.current) return;
    completedRef.current = true;
    // PRO-SYNC (2026-06-30): Exit instantly the moment the SVGA's own
    // timeline ends — no extra slide-out frames. The visible duration
    // equals the SVGA's authored duration exactly, "not one second more
    // and not one second less" as the user explicitly requires.
    setPhase('done');
    onCompleteRef.current?.();
  }, []);

  const handleSvgaComplete = useCallback(() => { triggerExit(); }, [triggerExit]);
  const handleSvgaError = useCallback(() => {
    setTimeout(() => triggerExit(), 800);
  }, [triggerExit]);

  // GIF/static image preload — kept as before.
  const [gifLoaded, setGifLoaded] = useState(!hasGifOrImage);
  useEffect(() => {
    if (hasGifOrImage && cleanAnimUrl) {
      const img = new Image();
      img.onload = () => setGifLoaded(true);
      img.onerror = () => setGifLoaded(true);
      img.src = cleanAnimUrl;
    }
  }, [hasGifOrImage, cleanAnimUrl]);

  // PRO-SYNC: prepare phase — warm SVGA before we ever show the banner, so the
  // moment the slide-in begins the animation's first frame is already painted.
  // Hard cap at 600ms so a slow/unreachable asset never blocks the welcome.
  useEffect(() => {
    mountedRef.current = true;

    let exitTimer: ReturnType<typeof setTimeout> | null = null;
    let proceeded = false;

    const proceedToAnimating = () => {
      if (proceeded || !mountedRef.current) return;
      proceeded = true;
      setPhase('animating');
      // SVGA exits via its own onComplete; static / GIF need a manual exit timer.
      if (!hasSvga) {
        const totalDuration = hasGifOrImage ? 3000 : 2500;
        exitTimer = setTimeout(() => triggerExit(), totalDuration);
      }
    };

    if (hasSvga && cleanAnimUrl) {
      if (svgaCacheHas(cleanAnimUrl)) {
        // Already parsed — start immediately, perfectly synced.
        proceedToAnimating();
      } else {
        // Warm the parser module + fetch+parse this asset in background.
        prewarmSVGA();
        prewarmPopularAssets([cleanAnimUrl]).catch(() => {});
        // Poll for cache readiness up to 600ms; whichever wins, start.
        const start = Date.now();
        const poll = setInterval(() => {
          if (!mountedRef.current) { clearInterval(poll); return; }
          if (svgaCacheHas(cleanAnimUrl) || Date.now() - start >= 600) {
            clearInterval(poll);
            proceedToAnimating();
          }
        }, 50);
        return () => {
          mountedRef.current = false;
          clearInterval(poll);
          if (exitTimer) clearTimeout(exitTimer);
        };
      }
    } else if (hasGifOrImage) {
      // GIF/image branch waits on gifLoaded flag below.
      if (gifLoaded) proceedToAnimating();
    } else {
      // No animation — just the pill, start immediately.
      proceedToAnimating();
    }

    return () => {
      mountedRef.current = false;
      if (exitTimer) clearTimeout(exitTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When GIF finishes preloading, kick off the slide-in (synced with first frame).
  useEffect(() => {
    if (hasGifOrImage && gifLoaded && phase === 'preparing') {
      setPhase('animating');
      const exitTimer = setTimeout(() => triggerExit(), 3000);
      return () => clearTimeout(exitTimer);
    }
  }, [hasGifOrImage, gifLoaded, phase, triggerExit]);

  if (phase === 'done' || phase === 'preparing') return null;

  // USER-EXPLICIT (2026-07-01): if the joining user has NO equipped entry
  // name-bar animation, render NOTHING here — the small vanishing welcome
  // message (RoomWelcomeBanner) is their entry indicator. No gradient pill
  // fallback, no oversized identity chip.
  if (!hasAnimation) return null;

  // Professional sizing (Chamet/BIGO/17 parity):
  // SVGA entry-name-bar templates are authored at a fixed ~1024×280 canvas
  // (aspect 3.66:1). We render the animation exactly like the VIP/Shop
  // preview (`EntryNameBarPreview`) — engraved-only, no HTML overlays on
  // top, dynamic slots inject avatar/name/level INSIDE the SVGA canvas so
  // the composite is one engraved unit.
  const shouldShow = true;

  return (
    <div
      className="fixed left-0 right-0 z-[90] pointer-events-none"
      style={{ bottom: bottomPosition }}
    >
      <AnimatePresence>
        {shouldShow && (
          <motion.div
            key="entry-namebar-banner"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={phase === 'exiting'
              ? { opacity: 0, scale: 0.96 }
              : { opacity: 1, scale: 1 }
            }
            exit={{ opacity: 0, scale: 0.96 }}
            // PRO-SYNC: ultra-short fade so the banner appears engraved
            // with the SVGA's first frame and disappears with its last.
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative w-full flex justify-center"
          >
            <div
              className={cn(
                "relative w-[min(680px,98vw)] aspect-[1024/280] overflow-visible"
              )}
            >
              {/* SVGA background — identity engraved INSIDE via dynamic slots
                  (1:1 parity with EntryNameBarPreview shown in VIP/Shop). */}
              {hasSvga && cleanAnimUrl && (
                <div className="absolute inset-0 z-[1] pointer-events-none">
                  <EntryAnimationFrame
                    src={cleanAnimUrl}
                    size="fill"
                    type="svga"
                    loop={false}
                    muted={false}
                    volume={0}
                    onComplete={handleSvgaComplete}
                    onError={handleSvgaError}
                    center={false}
                    dynamicAvatarUrl={avatarUrl ?? null}
                    dynamicUserName={userName}
                    dynamicUserLevel={level}
                  />
                </div>
              )}

              {/* GIF/Image background — identity is baked into the art;
                  no HTML overlay per user's engraved-only rule. */}
              {hasGifOrImage && cleanAnimUrl && gifLoaded && (
                <div className="absolute inset-0 z-[1] pointer-events-none">
                  <img
                    loading="lazy"
                    decoding="async"
                    src={cleanAnimUrl}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});


EntryNameBarAnimationInner.displayName = 'EntryNameBarAnimationInner';

export const EntryNameBarAnimation = ({
  userName, userLevel, avatarUrl, animationUrl, userId, onComplete, className, bottomPosition,
}: EntryNameBarAnimationProps) => {
  // Per-user stable key so two arrivals never share Inner state (avatar/name/
  // level/url frozen from a prior user). userId is the strongest identity;
  // displayName + url fall back when userId is missing.
  const stableKey = useRef(
    `entry-namebar-${userId || 'anon'}-${userName || 'user'}-${animationUrl || 'na'}-${Date.now()}`,
  );
  return (
    <EntryNameBarAnimationInner
      key={stableKey.current}
      userName={userName} userLevel={userLevel} avatarUrl={avatarUrl}
      animationUrl={animationUrl} userId={userId} onComplete={onComplete}
      className={className} bottomPosition={bottomPosition}
    />
  );
};

export default EntryNameBarAnimation;
