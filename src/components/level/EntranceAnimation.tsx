import React, { useEffect, useState, useMemo, useCallback, memo, forwardRef, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Howl } from 'howler';

// Eagerly import SVGAPlayerWithAudio for instant entry animations
import SVGAPlayerWithAudio from "@/components/common/SVGAPlayerWithAudio";

interface EntranceAnimationProps {
  userId: string;
  userInfo?: {
    displayName: string;
    avatarUrl?: string;
    level: number;
  };
  animationUrl?: string;
  soundUrl?: string; // Separate sound file URL from DB
  onComplete?: () => void;
  showDuration?: number;
}

// Detect animation type from URL - memoized outside component (same as FlyingGiftAnimation)
const getAnimationType = (url?: string): 'svga' | 'lottie' | 'video' | 'image' | null => {
  if (!url) return null;
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.svga')) return 'svga';
  if (cleanUrl.endsWith('.json')) return 'lottie';
  if (cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm')) return 'video';
  if (cleanUrl.endsWith('.gif') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.jpg')) return 'image';
  return null;
};

/**
 * EntranceAnimation - Refactored to match FlyingGiftAnimation performance
 * Uses same patterns: memo, stable callbacks, direct SVGA rendering
 * CRITICAL: Plays EXACTLY ONCE - no re-renders, no re-initialization
 */
const EntranceAnimationInner = memo(({ 
  userId, 
  userInfo, 
  animationUrl, 
  soundUrl,
  onComplete, 
  showDuration = 4000 
}: EntranceAnimationProps) => {
  const [showAnimation, setShowAnimation] = useState(true);
  const [animationEnded, setAnimationEnded] = useState(false);
  
  // CRITICAL: Prevent re-initialization on re-renders
  const mountedRef = useRef(true);
  const completedRef = useRef(false);
  const animationStartedRef = useRef(false);
  const soundRef = useRef<Howl | null>(null);
  const soundPlayedRef = useRef(false);
  
  // Stable memoized values - same pattern as FlyingGiftAnimation
  const displayAnimationUrl = useMemo(() => animationUrl, [animationUrl]);
  const animationType = useMemo(() => getAnimationType(displayAnimationUrl), [displayAnimationUrl]);
  const isSVGA = animationType === 'svga';

  // Debug log - only on first render
  useEffect(() => {
    console.log('[EntranceAnimation] 🚗 RENDERING ENTRANCE ANIMATION:', {
      userId,
      userName: userInfo?.displayName,
      animationUrl: displayAnimationUrl,
      type: animationType,
      isSVGA,
    });
  }, []);

  // Stable callback for animation complete - immediately notify parent to unmount and stop audio - ONLY ONCE
  const handleAnimationComplete = useCallback(() => {
    if (completedRef.current || !mountedRef.current) {
      console.log('[EntranceAnimation] ⚠️ Complete blocked - already completed');
      return;
    }
    completedRef.current = true;
    
    console.log('[EntranceAnimation] ✅ Animation completed - notifying parent');
    setShowAnimation(false);
    setAnimationEnded(true);
    // Immediately call onComplete to ensure audio stops
    onComplete?.();
  }, [onComplete]);

  // Auto-complete timer - SVGAPlayer handles its own completion via onFinished
  // CRITICAL: Empty deps - run ONLY ONCE on mount
  useEffect(() => {
    mountedRef.current = true;
    
    // CRITICAL: Prevent re-initialization on re-renders
    if (animationStartedRef.current) {
      console.log('[EntranceAnimation] ⚠️ Already started, skipping re-init');
      return;
    }
    animationStartedRef.current = true;
    
    // For SVGA, the SVGAPlayer component handles completion via native onFinished callback
    // We only need a safety fallback for extremely large files
    if (isSVGA) {
      // SVGA plays for its NATIVE duration ONLY - onComplete from SVGAPlayer handles completion
      // No extra timers added
      return () => { mountedRef.current = false; };
    }
    
    // For other types (lottie, video, image), use fixed duration
    const duration = animationType === 'lottie' ? 4000 : showDuration;
    const timer = setTimeout(() => {
      if (mountedRef.current && !completedRef.current) {
        handleAnimationComplete();
      }
    }, duration);
    
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []); // CRITICAL: Empty deps - run only ONCE on mount

  // No animation URL - complete immediately
  if (!displayAnimationUrl) {
    console.log('[EntranceAnimation] No animation URL - skipping');
    return null;
  }

  // Render full-screen animation - TRUE FULLSCREEN with no gaps (mobile optimized)
  const renderFullScreenAnimation = () => {
    if (!showAnimation || animationEnded) return null;

    if (isSVGA) {
      console.log('[EntranceAnimation] 🎬 Rendering SVGA entrance animation:', displayAnimationUrl);
      
      return (
        <motion.div
          key="svga-entrance"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.08 }}
          className="pointer-events-none"
          style={{
            // CRITICAL: Use fixed positioning at viewport edges
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 99999,
            overflow: 'visible',
          }}
        >
          {/* SVGA container with aggressive scale to fill entire screen */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '100%',
              height: '100%',
              // Scale up to 1.6x to guarantee full coverage on all devices
              transform: 'translate(-50%, -50%) scale(1.6)',
              transformOrigin: 'center center',
            }}
          >
            <SVGAPlayerWithAudio
                src={displayAnimationUrl}
                loop={false}
                autoPlay={true}
                volume={0.7}
                onComplete={handleAnimationComplete}
                onError={(err) => {
                  console.error('[EntranceAnimation] ❌ SVGA ERROR:', err?.message || err);
                  // On SVGA error, still complete the animation to avoid stuck state
                  handleAnimationComplete();
                }}
                className="w-full h-full"
              />
          </div>
        </motion.div>
      );
    }

    // For images/gifs - center with scale animation
    if (animationType === 'image') {
      return (
        <motion.div
          key="image-entrance"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
        >
          <motion.img 
            src={displayAnimationUrl} 
            alt="Entrance"
            className="w-full h-full object-contain"
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 1.5, repeat: 2 }}
          />
        </motion.div>
      );
    }

    // For video
    if (animationType === 'video') {
      return (
        <motion.div
          key="video-entrance"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
        >
          <video 
            src={displayAnimationUrl}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            onEnded={handleAnimationComplete}
          />
        </motion.div>
      );
    }

    return null;
  };

  return (
    <div 
      className="pointer-events-none overflow-hidden"
      style={{
        // CRITICAL: Use fixed positioning for true fullscreen
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 100000,
        margin: 0,
        padding: 0,
      }}
    >
      {/* Background overlay */}
      <motion.div
        className="bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
        }}
      />

      {/* Full-screen animation */}
      <AnimatePresence mode="wait">
        {renderFullScreenAnimation()}
      </AnimatePresence>

      {/* User name banner at bottom - like gift notification */}
      {userInfo && (
        <motion.div
          className="absolute left-0"
          style={{ bottom: '25%' }}
          initial={{ x: -300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -300, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 400, delay: 0.05 }}
        >
          <div className={cn(
            "flex items-center gap-2 pl-3 pr-5 py-2.5 rounded-r-full",
            "bg-gradient-to-r from-purple-600/95 via-fuchsia-500/90 to-pink-500/85",
            "backdrop-blur-xl shadow-2xl border-r border-t border-b border-white/20"
          )}>
            {/* Avatar */}
            {userInfo.avatarUrl ? (
              <img
                src={userInfo.avatarUrl}
                alt=""
                className="w-9 h-9 rounded-full border-2 border-white/60 object-cover shadow-lg"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 border-2 border-white/60 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                {userInfo.displayName.charAt(0).toUpperCase()}
              </div>
            )}

            {/* User info */}
            <div className="flex flex-col min-w-0">
              <span className="text-white font-bold text-sm truncate max-w-[120px] drop-shadow-md">
                {userInfo.displayName}
              </span>
              <span className="text-white/80 text-xs">
                🎉 entered the room
              </span>
            </div>

            {/* Level badge */}
            <div className="ml-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold shadow-lg">
              Lv.{userInfo.level}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
});

EntranceAnimationInner.displayName = 'EntranceAnimationInner';

// ForwardRef wrapper for AnimatePresence compatibility (same as FlyingGiftAnimation)
const EntranceAnimation = forwardRef<HTMLDivElement, EntranceAnimationProps>(
  (props, ref) => <EntranceAnimationInner {...props} />
);

EntranceAnimation.displayName = 'EntranceAnimation';

export default EntranceAnimation;
