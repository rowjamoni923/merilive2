import { useEffect, useState, useRef, memo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";
import { playSoundUrl } from "@/utils/soundPlayer";
import { detectProfessionalAnimationFormat } from "@/utils/animationFormat";


interface GiftEmojiAnimationProps {
  emoji: string; // Can be emoji character or URL to SVGA/image
  count?: number;
  animationFormat?: string | null;
  animationConfigUrl?: string | null;
  /** Optional separate sound asset URL (used when SVGA has no embedded audio) */
  soundUrl?: string;
  onComplete: () => void;
}

const FULLSCREEN_LAYER_STYLE: CSSProperties = {
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

const FULLSCREEN_STAGE_STYLE: CSSProperties = {
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

// CRITICAL: Memoized to prevent re-renders causing multiple SVGA loads
const GiftEmojiAnimationInner = memo(({ emoji, count = 1, animationFormat, animationConfigUrl, soundUrl, onComplete }: GiftEmojiAnimationProps) => {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
  const completedRef = useRef(false);
  const mountedRef = useRef(true);
  // CRITICAL: Track if animation already started to prevent re-initialization
  const animationStartedRef = useRef(false);
  
  // Handle animation complete - triggers exit phase - ONLY ONCE
  const handleAnimationEnd = () => {
    if (completedRef.current || !mountedRef.current) return;
    completedRef.current = true;
    console.log('[GiftEmojiAnimation] Animation complete - exiting');
    setPhase('exit');
    setTimeout(onComplete, 300);
  };

  // Check if emoji is actually a URL
  const isUrl = emoji.startsWith('http') || emoji.startsWith('/');
  const detectedFormat = isUrl ? detectProfessionalAnimationFormat(emoji, animationFormat) : null;
  const isSvga = detectedFormat === 'svga';
  const isLottie = detectedFormat === 'lottie';
  const isVideo = detectedFormat === 'mp4' || detectedFormat === 'webm';
  const isVap = detectedFormat === 'vap';
  const isImage = isUrl && !isSvga && !isLottie && !isVap && !isVideo;
  const isEmoji = !isUrl;
  const hasAnimation = isSvga || isLottie || isVap || isVideo;

  useEffect(() => {
    if (!soundUrl || isSvga) return;
    // Pkg422: routed through central player (anti-GC + unlock-aware
    // + limiter-bus + per-URL concurrency cap so combo gifts don't crackle).
    const handle = playSoundUrl(soundUrl, { volume: 0.8, maxConcurrent: 2 });
    return () => {
      try { handle.stop(); } catch { /* noop */ }
    };
  }, [soundUrl, isSvga]);

  
  useEffect(() => {
    mountedRef.current = true;
    
    // CRITICAL: Prevent re-initialization on re-renders
    if (animationStartedRef.current) {
      console.log('[GiftEmojiAnimation] ⚠️ Already started, skipping re-init');
      return;
    }
    animationStartedRef.current = true;
    
    // Enter phase
    const enterTimer = setTimeout(() => setPhase('show'), 300);
    
    // For non-animated content, use fixed timers
    if (!hasAnimation) {
      const showDuration = 2000;
      const showTimer = setTimeout(() => {
        if (mountedRef.current && !completedRef.current) {
          setPhase('exit');
        }
      }, showDuration);
      const exitTimer = setTimeout(() => {
        if (mountedRef.current && !completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
      }, showDuration + 300);
      
      return () => {
        mountedRef.current = false;
        clearTimeout(enterTimer);
        clearTimeout(showTimer);
        clearTimeout(exitTimer);
      };
    }
    
    // Animated media completes from the native player callback only. No fixed
    // duration is added here, so SVGA/Lottie/VAP do not get extra seconds.
    
    return () => {
      mountedRef.current = false;
      clearTimeout(enterTimer);
    };
  }, []); // CRITICAL: Empty deps - run only ONCE on mount

  const items = Array.from({ length: Math.min(count * 5, 20) });

  // CRITICAL: portal to <body> so position:fixed isn't trapped by ancestor
  // transforms (framer-motion, scroll containers) — guarantees true app-wide
  // full-screen across Chat / Live / Party / Private Call.
  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  // Render FULL SCREEN animation for SVGA/Lottie/VAP — NO overlay, NO sparkles, direct play
  if (hasAnimation) {
    return createPortal(
      <AnimatePresence>
        <motion.div
          style={FULLSCREEN_LAYER_STYLE}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div style={FULLSCREEN_STAGE_STYLE}>
            {isSvga && (
              <FixedAnimationFrame
                src={emoji}
                size="fullscreen"
                width="100dvw"
                height="100dvh"
                type="svga"
                loop={false}
                autoPlay
                muted={false}
                volume={0.8}
                soundUrl={soundUrl}
                onComplete={handleAnimationEnd}
                center
              />
            )}

            {(isLottie || isVap || isVideo) && (
              <FixedAnimationFrame
                src={emoji}
                size="fullscreen"
                width="100dvw"
                height="100dvh"
                type={isLottie ? 'lottie' : isVap ? 'vap' : 'mp4'}
                configSrc={animationConfigUrl || undefined}
                loop={false}
                autoPlay
                muted={isLottie ? true : !!soundUrl}
                volume={0.8}
                soundUrl={soundUrl}
                onComplete={handleAnimationEnd}
                center
              />
            )}
          </div>
        </motion.div>
      </AnimatePresence>,
      portalTarget
    );
  }

  // Render simple image - FULL SCREEN (no dark overlay, no sparkles)
  if (isImage) {
    return createPortal(
      <div style={FULLSCREEN_LAYER_STYLE}>
        <div style={FULLSCREEN_STAGE_STYLE}>
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{
              scale: [0, 1.08, 1],
              rotate: [0, 5, 0],
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ width: '100dvw', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <img loading="lazy" decoding="async" 
              src={emoji}
              alt="Gift"
              className="w-full h-full object-contain drop-shadow-2xl"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </motion.div>
        </div>
      </div>,
      portalTarget
    );
  }

  // Emoji burst animation (original behavior for text emojis)
  return createPortal(
    <div style={FULLSCREEN_LAYER_STYLE}>
      {/* Center Burst Animation */}
      <div style={FULLSCREEN_STAGE_STYLE}>
        {/* Main big emoji */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{
            scale: [0, 1.2, 1],
            rotate: [0, 15, 0],
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="drop-shadow-2xl"
        >
          <span className="text-[clamp(8rem,45vmin,22rem)] drop-shadow-2xl">{emoji}</span>
        </motion.div>

        {/* Exploding emoji items */}
        {items.map((_, i) => {
          const angle = (i / items.length) * Math.PI * 2;
          const distance = 120 + Math.random() * 80;
          return (
            <motion.div
              key={i}
              className="absolute text-4xl"
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{
                scale: [0, 1.5, 0.8, 0],
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                rotate: [0, 180, 360],
              }}
              transition={{
                duration: 1.5,
                delay: 0.2 + i * 0.03,
                ease: "easeOut",
              }}
            >
              {emoji}
            </motion.div>
          );
        })}
      </div>

      {/* Floating emojis from bottom */}
      {items.slice(0, 10).map((_, i) => (
        <motion.div
          key={`float-${i}`}
          className="absolute text-5xl"
          style={{
            left: `${10 + Math.random() * 80}%`,
          }}
          initial={{
            y: window.innerHeight + 50,
            x: 0,
            scale: 0.5 + Math.random() * 0.5,
            rotate: Math.random() * 60 - 30,
          }}
          animate={{
            y: -100,
            x: Math.random() * 100 - 50,
            rotate: Math.random() * 360,
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 2.5 + Math.random() * 1,
            delay: i * 0.15,
            ease: "easeOut",
          }}
        >
          {emoji}
        </motion.div>
      ))}

      {/* Sparkle effects */}
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={`sparkle-${i}`}
          className="absolute left-1/2 top-1/2 w-3 h-3 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500"
          initial={{ scale: 0, x: 0, y: 0 }}
          animate={{
            scale: [0, 1.5, 0],
            x: Math.cos((i / 8) * Math.PI * 2) * 150,
            y: Math.sin((i / 8) * Math.PI * 2) * 150,
          }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
      ))}
    </div>,
    portalTarget
  );
});

GiftEmojiAnimationInner.displayName = 'GiftEmojiAnimationInner';

// Wrapper to ensure stable key and prevent re-mounts.
// Pkg-fix: forward animationFormat + animationConfigUrl so VAP gifts ("hi", etc.)
// render through the VAP pipeline instead of falling back to plain <video>
// (which showed the side-by-side raw frame = "broken image" full-screen).
export const GiftEmojiAnimation = ({
  emoji,
  count = 1,
  animationFormat,
  animationConfigUrl,
  soundUrl,
  onComplete,
}: GiftEmojiAnimationProps) => {
  // CRITICAL: Use stable key based on emoji URL to prevent re-mounting
  const stableKey = useRef(`gift-anim-${Date.now()}-${emoji.slice(-20)}`);

  return (
    <GiftEmojiAnimationInner
      key={stableKey.current}
      emoji={emoji}
      count={count}
      animationFormat={animationFormat}
      animationConfigUrl={animationConfigUrl}
      soundUrl={soundUrl}
      onComplete={onComplete}
    />
  );
};

export default GiftEmojiAnimation;
