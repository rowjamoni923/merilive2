import React, { useEffect, useState, useMemo, useCallback, memo, forwardRef, Suspense, lazy, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Lazy load SVGAPlayerWithAudio for gift animations with sound
const SVGAPlayerWithAudio = lazy(() => import("@/components/common/SVGAPlayerWithAudio"));

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
}

interface FlyingGiftAnimationProps {
  gift: FlyingGift;
  onComplete: () => void;
}

// Detect animation type from URL - memoized outside component
const getAnimationType = (url?: string): 'svga' | 'lottie' | 'video' | 'image' | null => {
  if (!url) return null;
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.svga')) return 'svga';
  if (cleanUrl.endsWith('.json')) return 'lottie';
  if (cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm')) return 'video';
  if (cleanUrl.endsWith('.gif') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.jpg')) return 'image';
  return null;
};

// Determine animation style based on gift value
const getGiftAnimationStyle = (coins: number): 'premium' | 'luxury' | 'special' | 'normal' => {
  if (coins >= 50000) return 'premium';
  if (coins >= 10000) return 'luxury';
  if (coins >= 1000) return 'special';
  return 'normal';
};

// Main component - memoized for performance
const FlyingGiftAnimationInner = memo(({ gift, onComplete }: FlyingGiftAnimationProps) => {
  const [currentCount, setCurrentCount] = useState(0);
  const [showFullScreenAnimation, setShowFullScreenAnimation] = useState(true);
  const [animationEnded, setAnimationEnded] = useState(false);
  const [svgaError, setSvgaError] = useState(false);
  const soundPlayedRef = useRef(false);
  
  // CRITICAL: Prevent re-initialization on re-renders
  const mountedRef = useRef(true);
  const completedRef = useRef(false);
  const animationStartedRef = useRef(false);
  
  // Stable memoized values
  const displayAnimationUrl = useMemo(() => gift.animationUrl || gift.giftImageUrl, [gift.animationUrl, gift.giftImageUrl]);
  const animationType = useMemo(() => getAnimationType(displayAnimationUrl), [displayAnimationUrl]);
  const animationStyle = useMemo(() => getGiftAnimationStyle(gift.coins), [gift.coins]);
  
  // If SVGA error occurred, treat as non-SVGA
  const isSVGA = animationType === 'svga' && !svgaError;
  const isAnimated = isSVGA || animationType === 'lottie';

  // Debug log - only on first render
  useEffect(() => {
    console.log('[FlyingGiftAnimation] Gift:', gift.giftName, {
      animationUrl: gift.animationUrl,
      soundUrl: gift.soundUrl,
      type: animationType,
      isSVGA,
    });
    
    // Play sound_url from DB if available and SVGA doesn't have embedded audio
    // For non-SVGA gifts, always play sound_url
    if (!soundPlayedRef.current && gift.soundUrl) {
      soundPlayedRef.current = true;
      const audio = new Audio(gift.soundUrl);
      audio.volume = 0.6;
      audio.play().catch(() => {});
    }
  }, []);

  // Stable callback for animation complete - IMMEDIATELY notify parent to unmount - ONLY ONCE
  const handleAnimationComplete = useCallback(() => {
    if (completedRef.current || !mountedRef.current) {
      console.log('[FlyingGiftAnimation] ⚠️ Complete blocked - already completed');
      return;
    }
    completedRef.current = true;
    
    console.log('[FlyingGiftAnimation] ✅ SVGA animation completed for:', gift.giftName);
    setShowFullScreenAnimation(false);
    setAnimationEnded(true);
    // Immediately call onComplete to unmount and stop any audio
    onComplete();
  }, [gift.giftName, onComplete]);

  // Handle SVGA error - fallback to emoji animation with short timer
  const handleSvgaError = useCallback((error: Error) => {
    console.warn('[FlyingGiftAnimation] SVGA failed, using fallback for:', gift.giftName, error);
    setSvgaError(true);
    // CRITICAL: Start a short fallback timer since SVGA failed
    setTimeout(() => {
      if (mountedRef.current && !completedRef.current) {
        console.log('[FlyingGiftAnimation] Fallback timer complete after SVGA error');
        handleAnimationComplete();
      }
    }, 600);
  }, [gift.giftName, handleAnimationComplete]);

  // Smooth count-up animation
  useEffect(() => {
    const targetCount = gift.count;
    const duration = Math.min(800, targetCount * 30);
    const startTime = performance.now();
    
    let rafId: number;
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic for smooth deceleration
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      setCurrentCount(Math.round(targetCount * easedProgress));
      
      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };
    
    rafId = requestAnimationFrame(animate);
    
    return () => cancelAnimationFrame(rafId);
  }, [gift.count]);

  // =====================================================
  // GIFT DISPLAY POLICY (Applied Everywhere):
  // - PNG/GIF/WebP (Static): Less than 1 second (800ms)
  // - SVGA: Play for FULL animation duration - ONLY ONCE
  // =====================================================
  useEffect(() => {
    mountedRef.current = true;
    
    // CRITICAL: Prevent re-initialization on re-renders
    if (animationStartedRef.current) {
      console.log('[FlyingGiftAnimation] ⚠️ Already started, skipping re-init');
      return;
    }
    animationStartedRef.current = true;
    
    // For SVGA: let native onFinished determine exact duration (no fixed timer override)
    if (isSVGA && !svgaError) {
      return () => {
        mountedRef.current = false;
      };
    }
    
    // For PNG/GIF/WebP/fallback - show for LESS THAN 1 SECOND (600ms)
    const duration = 600; // 600ms for static images (sub-1-second)
    const timer = setTimeout(() => {
      if (mountedRef.current && !completedRef.current) {
        console.log('[FlyingGiftAnimation] Static image timer complete - 600ms');
        handleAnimationComplete();
      }
    }, duration);
    
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []); // CRITICAL: Empty deps - run only ONCE on mount

  // Render gift icon for banner - handle SVGA URLs properly
  // SVGA files cannot be shown in <img> tags - need SVGAPlayer or fallback
  const renderGiftIcon = useCallback(() => {
    const iconUrl = gift.giftImageUrl || gift.giftIcon;
    
    // If it's an emoji (not a URL), show it
    if (!iconUrl || (!iconUrl.startsWith('http') && !iconUrl.startsWith('/'))) {
      return <span className="text-xl">{gift.giftIcon || '🎁'}</span>;
    }
    
    // Check if URL points to SVGA - SVGA cannot be displayed as img
    const cleanUrl = iconUrl.split('?')[0].toLowerCase();
    const isSvgaUrl = cleanUrl.endsWith('.svga');
    
    if (isSvgaUrl) {
      // For SVGA icon_url, show a mini SVGA player OR emoji fallback
      // Use emoji for banner (since mini SVGA is too small to be useful)
      return <span className="text-xl">🎁</span>;
    }
    
    // For regular image URLs (PNG, JPG, GIF, WebP), show them
    return (
      <img 
        src={iconUrl} 
        alt={gift.giftName}
        className="w-8 h-8 object-contain"
        loading="eager"
        onError={(e) => {
          // On error, replace with emoji
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          target.parentElement!.innerHTML = `<span class="text-xl">🎁</span>`;
        }}
      />
    );
  }, [gift.giftImageUrl, gift.giftName, gift.giftIcon]);

  // Full-screen SVGA animation - TRUE FULL SCREEN FOR MOBILE (NO GAPS)
  // Uses CSS scale transform to guarantee 100% viewport coverage
  const renderFullScreenAnimation = useCallback(() => {
    if (!showFullScreenAnimation || animationEnded) return null;

    // If SVGA failed or no animation URL, show fallback with icon/emoji burst
    if (svgaError || !displayAnimationUrl) {
      // Determine if giftIcon is a URL or emoji
      const iconIsUrl = gift.giftIcon && (gift.giftIcon.startsWith('http') || gift.giftIcon.startsWith('/'));
      const fallbackIcon = gift.giftImageUrl || gift.giftIcon;
      const fallbackIsUrl = fallbackIcon && (fallbackIcon.startsWith('http') || fallbackIcon.startsWith('/'));
      
      const renderFallbackIcon = (size: string = 'text-[120px]') => {
        if (fallbackIsUrl) {
          return (
            <img 
              src={fallbackIcon} 
              alt={gift.giftName}
              className={size === 'text-[120px]' ? 'w-32 h-32 object-contain drop-shadow-2xl' : 'w-10 h-10 object-contain'}
            />
          );
        }
        return <span className={`${size} drop-shadow-2xl`}>{gift.giftIcon || '🎁'}</span>;
      };

      return (
        <motion.div
          key="fallback-animation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Big central icon/emoji - STARTS FROM CENTER */}
          <motion.div
            initial={{ scale: 0, rotate: -30, y: 0 }}
            animate={{ scale: [0, 1.5, 1.2], rotate: [0, 15, 0], y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="drop-shadow-2xl"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            {renderFallbackIcon('text-[120px]')}
          </motion.div>
          
          {/* Exploding particles from center */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const distance = 120 + Math.random() * 80;
            return (
              <motion.div
                key={`particle-${i}`}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                }}
                initial={{ scale: 0, x: '-50%', y: '-50%' }}
                animate={{
                  scale: [0, 1.5, 0.8, 0],
                  x: `calc(-50% + ${Math.cos(angle) * distance}px)`,
                  y: `calc(-50% + ${Math.sin(angle) * distance}px)`,
                  rotate: [0, 180, 360],
                }}
                transition={{
                  duration: 1.5,
                  delay: 0.2 + i * 0.03,
                  ease: "easeOut",
                }}
              >
                {renderFallbackIcon('text-4xl')}
              </motion.div>
            );
          })}
        </motion.div>
      );
    }

    if (isSVGA) {
      return (
        <motion.div
          key="svga-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
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
            // Force overflow visible so scaled content shows
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
              // This ensures NO gaps even with different SVGA aspect ratios
              transform: 'translate(-50%, -50%) scale(1.6)',
              transformOrigin: 'center center',
            }}
          >
            <Suspense fallback={<div className="w-full h-full bg-gradient-to-br from-purple-600/30 to-pink-600/30 animate-pulse" />}>
              <SVGAPlayerWithAudio
                src={displayAnimationUrl}
                loop={false}  // CRITICAL: Play exactly ONCE
                autoPlay={true}
                volume={0.8}
                onComplete={handleAnimationComplete}
                onError={handleSvgaError}
                className="w-full h-full max-w-[85vw] max-h-[85vh]"  // Constrain size
              />
            </Suspense>
          </div>
        </motion.div>
      );
    }

    // For images (PNG, GIF, WebP) - CENTER OF SCREEN with scale animation
    return (
      <motion.div
        key="image-fullscreen"
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="pointer-events-none"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 99999, // HIGH z-index like SVGA
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <motion.img 
          src={displayAnimationUrl} 
          alt={gift.giftName}
          className="w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 object-contain drop-shadow-2xl"
          initial={{ scale: 0, rotate: -15 }}
          animate={{ 
            scale: [0, 1.3, 1], 
            rotate: [0, 10, 0],
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </motion.div>
    );
  }, [showFullScreenAnimation, displayAnimationUrl, animationEnded, isSVGA, svgaError, gift.giftName, gift.giftIcon, handleAnimationComplete, handleSvgaError]);

  // Memoized particles - only for premium/luxury gifts
  const particles = useMemo(() => {
    if (animationStyle === 'normal' || animationStyle === 'special') return null;
    
    const count = animationStyle === 'premium' ? 12 : 8;
    
    return Array.from({ length: count }).map((_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const radius = 100 + (i % 3) * 40;
      
      return (
        <motion.div
          key={`p-${i}`}
          className="absolute w-2 h-2 rounded-full"
          style={{
            background: ['#FFD700', '#FF69B4', '#00CED1', '#9370DB'][i % 4],
            left: '50%',
            top: '40%'
          }}
          initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
          animate={{
            scale: [0, 1, 0],
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            opacity: [0, 0.8, 0],
          }}
          transition={{ duration: 1.2, delay: i * 0.05 }}
        />
      );
    });
  }, [animationStyle]);

  return (
    <div 
      className="pointer-events-none overflow-hidden"
      style={{
        // CRITICAL: Use fixed positioning with transform for true fullscreen
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 100000,
        // Ensure it covers safe areas on notched devices
        margin: 0,
        padding: 0,
      }}
    >
      {/* Background glow for premium/luxury */}
      {(animationStyle === 'premium' || animationStyle === 'luxury') && (
        <motion.div
          className={cn(
            animationStyle === 'premium' 
              ? "bg-gradient-to-b from-purple-500/15 via-pink-500/10 to-transparent"
              : "bg-gradient-to-b from-amber-500/10 to-transparent"
          )}
          style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Full-screen animation */}
      <AnimatePresence mode="wait">
        {renderFullScreenAnimation()}
      </AnimatePresence>

      {/* Particles for premium gifts */}
      {particles}

      {/* COMPACT Gift Banner - Bottom Left - Small, Fast, 1 second display */}
      <motion.div
        className="absolute left-0"
        style={{ bottom: '15%' }}
        initial={{ x: -200, opacity: 0, scale: 0.9 }}
        animate={{ 
          x: 0, 
          opacity: 1, 
          scale: 1,
          transition: { type: "spring", damping: 30, stiffness: 600, duration: 0.15 }
        }}
        exit={{ 
          x: 250, 
          opacity: 0, 
          scale: 0.8,
          transition: { duration: 0.1, ease: "easeOut" }
        }}
      >
        <div className={cn(
          "flex items-center gap-1 pl-1.5 pr-2.5 py-1 rounded-r-full",
          animationStyle === 'premium' 
            ? "bg-gradient-to-r from-amber-600/90 via-orange-500/85 to-red-500/80"
            : animationStyle === 'luxury'
            ? "bg-gradient-to-r from-purple-600/90 via-pink-500/85 to-rose-500/80"
            : "bg-gradient-to-r from-pink-600/85 via-purple-500/80 to-indigo-500/75",
          "backdrop-blur-lg shadow-lg border-r border-t border-b border-white/15"
        )}>
          {/* Sender Avatar - SMALLER */}
          {gift.senderAvatar ? (
            <img
              src={gift.senderAvatar}
              alt=""
              className="w-6 h-6 rounded-full border border-white/50 object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 border border-white/50 flex items-center justify-center text-white font-bold text-[9px]">
              {gift.senderName.charAt(0).toUpperCase()}
            </div>
          )}

          {/* COMPACT Text - Single line "Name sent Gift" */}
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-white font-semibold text-[10px] truncate max-w-[50px] drop-shadow">
              {gift.senderName}
            </span>
            <span className="text-white/60 text-[9px]">sent</span>
            <span className="text-amber-200 font-semibold text-[10px] truncate max-w-[50px]">
              {gift.giftName}
            </span>
          </div>

          {/* Combo Count - SMALLER */}
          <motion.span 
            className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-yellow-300 to-orange-400 ml-0.5"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.15, repeat: 1 }}
          >
            x{currentCount}
          </motion.span>
        </div>
      </motion.div>
    </div>
  );
});

FlyingGiftAnimationInner.displayName = 'FlyingGiftAnimationInner';

// ForwardRef wrapper for AnimatePresence compatibility
export const FlyingGiftAnimation = forwardRef<HTMLDivElement, FlyingGiftAnimationProps>(
  (props, ref) => <FlyingGiftAnimationInner {...props} />
);

// Hook to manage flying gift queue
export function useFlyingGifts() {
  const [gifts, setGifts] = useState<FlyingGift[]>([]);

  const addGift = useCallback((gift: Omit<FlyingGift, 'id'>) => {
    const newGift: FlyingGift = {
      ...gift,
      id: `${Date.now()}-${Math.random()}`,
    };
    setGifts(prev => [...prev, newGift]);
  }, []);

  const removeGift = useCallback((id: string) => {
    setGifts(prev => prev.filter(g => g.id !== id));
  }, []);

  return { gifts, addGift, removeGift };
}

export default FlyingGiftAnimation;
