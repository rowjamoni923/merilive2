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
import FramedAvatarWithPrivileges from "@/components/common/FramedAvatarWithPrivileges";
import { svgaCacheHas } from "@/utils/svgaCache";
import { prewarmPopularAssets, prewarmSVGA } from "@/utils/svgaPrewarm";


const getNameBarAnimationType = (url?: string): 'svga' | 'gif' | 'image' | null => {
  if (!url) return null;
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.svga')) return 'svga';
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
    setPhase('exiting');
    setTimeout(() => {
      if (mountedRef.current) setPhase('done');
      onCompleteRef.current?.();
    }, 600);
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

  // Professional sizing (Chamet/BIGO/17 parity):
  // SVGA entry-name-bar templates are authored at a fixed ~1024×280 canvas
  // (aspect 3.66:1). We lock the banner to that aspect ratio so the overlay
  // (avatar + name + level) always sits inside the engraved content slot,
  // regardless of viewport width. The content slot in every standard template
  // is roughly the left-center region from ~22% → ~70% horizontally, with a
  // ~14% top/bottom safe area. All overlay sizes are percentage-based so the
  // composite scales as one engraved unit — never "too big, never too small".
  const showAnimationLayer = true;
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
            initial={{ x: '110%', opacity: 0 }}
            animate={phase === 'exiting'
              ? { x: '-120%', opacity: 0 }
              : { x: 0, opacity: 1 }
            }
            exit={{ x: '-120%', opacity: 0 }}
            transition={{
              type: "spring",
              damping: phase === 'exiting' ? 18 : 24,
              stiffness: phase === 'exiting' ? 180 : 300,
              mass: 0.8,
            }}
            className="relative w-full flex justify-center"
          >
            <div
              className={cn(
                "relative",
                hasAnimation
                  ? "w-[min(560px,94vw)] aspect-[1024/280] overflow-visible"
                  : "mx-2 rounded-full overflow-hidden w-auto h-11"
              )}
            >
              {/* Layer 0: Base gradient fallback - ONLY when no animation */}
              {!hasAnimation && (
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/90 via-purple-800/85 to-indigo-900/90 backdrop-blur-md rounded-full" />
              )}

              {/* Layer 1: SVGA background */}
              {hasSvga && cleanAnimUrl && showAnimationLayer && (
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

              {/* Layer 1: GIF/Image background */}
              {hasGifOrImage && cleanAnimUrl && gifLoaded && showAnimationLayer && (
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

              {/* Layer 2: Avatar + Name + Level — engraved into the ribbon's
                  inner content slot. Tight percentages match the SVGA
                  template's left-side ribbon and never overflow into the
                  right-side decoration. Plain circular avatar (no privilege
                  frame) to mirror the professional reference. */}
              <div
                className={cn(
                  "absolute z-[2] flex items-center pointer-events-none",
                  hasAnimation
                    ? "top-[28%] bottom-[28%] left-[7%] right-[48%] gap-[3%]"
                    : "inset-0 gap-2 px-3"
                )}
              >
                <Avatar className={cn(
                  "flex-shrink-0 ring-2 ring-white/70 shadow-md",
                  hasAnimation ? "h-full aspect-square" : "w-9 h-9"
                )}>
                  <AvatarImage
                    src={avatarUrl || getDisplayAvatar(userName)}
                    alt={userName}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-gradient-to-br from-violet-600 to-purple-700 text-white text-[10px] font-bold">
                    {userName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                {/* Compact level chip — small round badge like pro reference */}
                <div
                  className={cn(
                    "flex-shrink-0 rounded-full font-black flex items-center justify-center shadow-md",
                    hasAnimation
                      ? "h-[55%] aspect-square text-[10px] leading-none"
                      : "px-1.5 py-0.5 text-[9px]",
                    getLevelBadgeBg(level),
                    getLevelTextColor(level)
                  )}
                >
                  {String(level ?? 1)}
                </div>

                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <span
                    className={cn(
                      "text-white font-black truncate leading-tight",
                      hasAnimation ? "text-[13px]" : "text-sm max-w-[140px]"
                    )}
                    style={
                      hasAnimation
                        ? { textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.7)' }
                        : undefined
                    }
                  >
                    {userName}
                  </span>

                  {!hasAnimation ? (
                    <span className="text-white/90 font-bold drop-shadow-sm leading-none text-[10px]">
                      Welcome to the room! 🎉
                    </span>
                  ) : (
                    <span
                      className="text-white/95 font-semibold truncate text-[10px] leading-tight"
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                    >
                      Joined the room
                    </span>
                  )}
                </div>
              </div>

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
  const stableKey = useRef(`entry-namebar-${Date.now()}-${userName}`);
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
