import { useState, useRef, useCallback, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  getLevelBadgeBg, 
  getLevelTextColor, 
  ensureValidLevel, 
  formatLevel 
} from "@/features/shared/level";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";

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
  onComplete,
  className,
  bottomPosition = '12%',
}: EntryNameBarAnimationProps) => {
  const [phase, setPhase] = useState<'entering' | 'exiting' | 'done'>('entering');
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
      if (mountedRef.current) {
        setPhase('done');
      }
      onCompleteRef.current?.();
    }, 600);
  }, []); // CRITICAL: Empty deps - uses ref for onComplete

  // SVGA finished playing → slide out
  const handleSvgaComplete = useCallback(() => {
    triggerExit();
  }, [triggerExit]);

  // SVGA error → show for 800ms then exit
  const handleSvgaError = useCallback(() => {
    setTimeout(() => triggerExit(), 800);
  }, [triggerExit]);

  // Auto-exit timer - CRITICAL: Empty deps - runs ONCE on mount (like UnifiedEntryAnimation)
  useEffect(() => {
    mountedRef.current = true;
    
    if (hasSvga) {
      // SVGA plays for its NATIVE duration ONLY - onComplete handles exit
      // No extra timers added
      return () => { mountedRef.current = false; };
    }
    const duration = 2500; // 2.5s display time for static/GIF/no-animation name bars
    const timer = setTimeout(() => triggerExit(), duration);
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []); // CRITICAL FIX: Empty deps - prevents timer reset on parent re-renders

  // For GIF: preload image before showing
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

  const bannerHeight = hasAnimation ? 100 : 44;
  const isVisible = phase === 'entering' || phase === 'exiting';
  const shouldShow = isVisible && (hasSvga || gifLoaded);

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
            className="relative w-full"
          >
            <div
              className={cn(
                "relative mx-2 overflow-hidden",
                hasAnimation ? "rounded-2xl" : "rounded-full"
              )}
              style={{ height: `${bannerHeight}px` }}
            >
              {/* Layer 0: Base gradient fallback - ONLY when no animation */}
              {!hasAnimation && (
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/90 via-purple-800/85 to-indigo-900/90 backdrop-blur-md" />
              )}

              {/* Layer 1: SVGA background */}
              {hasSvga && cleanAnimUrl && (
                <div className="absolute inset-0 z-[1]">
                  <FixedAnimationFrame
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
              {hasGifOrImage && cleanAnimUrl && gifLoaded && (
                <div className="absolute inset-0 z-[1]">
                  <img
                    src={cleanAnimUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Layer 2: User info - Avatar + Name + Level */}
              <div
                className={cn(
                  "absolute inset-0 z-[2] flex items-center",
                  hasAnimation ? "gap-3 px-4" : "gap-2 px-3"
                )}
              >
                <Avatar className={cn(
                  "flex-shrink-0 ring-2 ring-white/60 shadow-lg",
                  hasAnimation ? "w-11 h-11" : "w-8 h-8"
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

                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    "text-white font-bold truncate drop-shadow-md",
                    hasAnimation ? "text-sm max-w-[140px]" : "text-xs max-w-[120px]"
                  )}>
                    {userName}
                  </span>
                  <div className={cn(
                    "px-1.5 py-0.5 rounded-md font-black flex-shrink-0",
                    hasAnimation ? "text-[10px]" : "text-[9px]",
                    getLevelBadgeBg(level),
                    getLevelTextColor(level)
                  )}>
                    {formatLevel(level)}
                  </div>
                </div>

                {hasAnimation && (
                  <span className="ml-auto text-white/60 text-[10px] flex-shrink-0 drop-shadow-sm">
                    joined
                  </span>
                )}
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
  userName, userLevel, avatarUrl, animationUrl, onComplete, className, bottomPosition,
}: EntryNameBarAnimationProps) => {
  const stableKey = useRef(`entry-namebar-${Date.now()}-${userName}`);
  return (
    <EntryNameBarAnimationInner 
      key={stableKey.current}
      userName={userName} userLevel={userLevel} avatarUrl={avatarUrl}
      animationUrl={animationUrl} onComplete={onComplete}
      className={className} bottomPosition={bottomPosition}
    />
  );
};

export default EntryNameBarAnimation;
