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
 * Entry Name Bar Animation - Professional Sliding Banner
 * 
 * CRITICAL FIX: Uses refs for callbacks to prevent timer resets on parent re-renders.
 * The banner slides in, displays for the animation duration, then slides out.
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

  // Phases:
  //  - 'name-in'  : Only avatar + name + level slides in (right → center). 350ms.
  //  - 'animating': SVGA/GIF starts playing as background, name stays composited on top.
  //  - 'exiting'  : Whole composite slides out left.
  //  - 'done'     : Unmounted.
  const [phase, setPhase] = useState<'name-in' | 'animating' | 'exiting' | 'done'>('name-in');
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

  // Stage timer: name shows first (350ms), then animation kicks in.
  useEffect(() => {
    mountedRef.current = true;

    const stageTimer = setTimeout(() => {
      if (mountedRef.current) setPhase('animating');
    }, 350);

    // SVGA exits via its own onComplete; static / GIF need a manual exit timer.
    let exitTimer: ReturnType<typeof setTimeout> | null = null;
    if (!hasSvga) {
      const totalDuration = hasGifOrImage ? 3000 : 2500;
      exitTimer = setTimeout(() => triggerExit(), totalDuration);
    }

    return () => {
      mountedRef.current = false;
      clearTimeout(stageTimer);
      if (exitTimer) clearTimeout(exitTimer);
    };
  }, []);

  // For GIF: preload before showing
  const [gifLoaded, setGifLoaded] = useState(!hasGifOrImage);
  useEffect(() => {
    if (hasGifOrImage && cleanAnimUrl) {
      const img = new Image();
      img.onload = () => setGifLoaded(true);
      img.onerror = () => setGifLoaded(true);
      img.src = cleanAnimUrl;
    }
  }, [hasGifOrImage, cleanAnimUrl]);

  if (phase === 'done') return null;

  // Professional sizing (Chamet/BIGO parity):
  //  SVGA name bars are wide horizontal ribbons; render at ~5:1 aspect.
  const bannerHeight = hasAnimation ? 110 : 44;
  // Mount the SVGA/GIF layer only AFTER the name has slid in.
  const showAnimationLayer = phase === 'animating' || phase === 'exiting';
  const shouldShow = hasSvga || !hasGifOrImage || gifLoaded;

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
                hasAnimation ? "w-[min(560px,94vw)] overflow-visible" : "mx-2 rounded-full overflow-hidden w-auto"
              )}
              style={{ height: `${bannerHeight}px` }}
            >
              {/* Layer 0: Base gradient fallback - ONLY when no animation */}
              {!hasAnimation && (
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/90 via-purple-800/85 to-indigo-900/90 backdrop-blur-md rounded-full" />
              )}

              {/* Layer 1: SVGA background — only mounts after name slides in */}
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

              {/* Layer 2: Avatar + Name + Level — composited at the LEFT-CENTER
                  anchor where professional SVGA name-bar templates reserve space
                  for dynamic content. Slides in first, animation follows. */}
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className={cn(
                  "absolute inset-y-0 z-[2] flex items-center",
                  hasAnimation
                    ? "left-[14%] right-[10%] gap-3"
                    : "inset-x-0 gap-2 px-3"
                )}
              >
                {userId ? (
                  <FramedAvatarWithPrivileges
                    userId={userId}
                    src={avatarUrl}
                    name={userName}
                    level={level}
                    size={hasAnimation ? "md" : "sm"}
                    showFrame
                    showGlow={false}
                    showAnimation={false}
                    className="flex-shrink-0"
                  />
                ) : (
                  <Avatar className={cn(
                    "flex-shrink-0 ring-2 ring-white/60 shadow-lg",
                    hasAnimation ? "w-14 h-14" : "w-9 h-9"
                  )}>
                    <AvatarImage
                      src={avatarUrl || getDisplayAvatar(userName)}
                      alt={userName}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-gradient-to-br from-violet-600 to-purple-700 text-white text-xs font-bold">
                      {userName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-white font-black truncate",
                        hasAnimation ? "text-[16px] max-w-[200px]" : "text-sm max-w-[140px]"
                      )}
                      style={
                        hasAnimation
                          ? { textShadow: '0 2px 6px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.6)' }
                          : undefined
                      }
                    >
                      {userName}
                    </span>
                    <div className={cn(
                      "px-1.5 py-0.5 rounded-md font-black flex-shrink-0 shadow-md",
                      hasAnimation ? "text-[10px]" : "text-[9px]",
                      getLevelBadgeBg(level),
                      getLevelTextColor(level)
                    )}>
                      {formatLevel(level)}
                    </div>
                  </div>

                  {/* Welcome line ONLY for the static (no-animation) pill.
                      With SVGA/GIF the template carries the decorative
                      messaging — extra text would look unprofessional. */}
                  {!hasAnimation && (
                    <span className="text-white/90 font-bold drop-shadow-sm leading-none text-[10px]">
                      Welcome to the room! 🎉
                    </span>
                  )}
                </div>
              </motion.div>
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
