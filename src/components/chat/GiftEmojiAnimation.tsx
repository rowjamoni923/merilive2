import { useEffect, useState, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";

interface GiftEmojiAnimationProps {
  emoji: string; // Can be emoji character or URL to SVGA/image
  count?: number;
  onComplete: () => void;
}

// CRITICAL: Memoized to prevent re-renders causing multiple SVGA loads
const GiftEmojiAnimationInner = memo(({ emoji, count = 1, onComplete }: GiftEmojiAnimationProps) => {
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
  const isUrl = emoji.startsWith('http');
  const normalizedUrl = isUrl ? emoji.toLowerCase().split('?')[0] : '';
  const isSvga = isUrl && normalizedUrl.endsWith('.svga');
  const isLottie = isUrl && normalizedUrl.endsWith('.json');
  const isVap = isUrl && (normalizedUrl.includes('vap') || normalizedUrl.includes('_bmp'));
  const isImage = isUrl && !isSvga && !isLottie && !isVap;
  const isEmoji = !isUrl;
  const hasAnimation = isSvga || isLottie || isVap;
  
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
    
    // For animated content (SVGA/Lottie/VAP), use safety timeout only
    const safetyTimeout = setTimeout(() => {
      if (mountedRef.current && !completedRef.current) {
        console.log('[GiftEmojiAnimation] Safety timeout - forcing complete');
        handleAnimationEnd();
      }
    }, 15000); // 15s safety
    
    return () => {
      mountedRef.current = false;
      clearTimeout(enterTimer);
      clearTimeout(safetyTimeout);
    };
  }, []); // CRITICAL: Empty deps - run only ONCE on mount

  const items = Array.from({ length: Math.min(count * 5, 20) });

  // Render FULL SCREEN animation for SVGA/Lottie/VAP
  if (hasAnimation) {
    return (
      <AnimatePresence>
        <motion.div 
          className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Dark overlay for emphasis */}
          <motion.div 
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'show' ? 0.5 : 0 }}
            transition={{ duration: 0.5 }}
          />
          
          {/* TRUE Full-screen animation container */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ 
              scale: phase === 'enter' ? [0.5, 1.05, 1] : phase === 'exit' ? [1, 1.05, 0.5] : 1,
              opacity: phase === 'exit' ? 0 : 1
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {/* SVGA Player - Proper full screen with audio */}
            {isSvga && (
              <div className="absolute inset-0 flex items-center justify-center">
                <SVGAPlayerWithAudio
                  src={emoji}
                  className="w-full h-full max-w-[90vw] max-h-[90vh]"
                  loop={false}
                  autoPlay={true}
                  volume={0.8}
                  onComplete={handleAnimationEnd}
                />
              </div>
            )}
            
            {/* Lottie/Universal Player - Proper full screen */}
            {(isLottie || isVap) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <UniversalAnimationPlayer
                  src={emoji}
                  className="w-full h-full max-w-[90vw] max-h-[90vh]"
                  loop={false}
                  autoPlay={true}
                  muted={false}
                  onComplete={handleAnimationEnd}
                />
              </div>
            )}
          </motion.div>
          
          {/* Sparkle effects around the animation */}
          {Array.from({ length: 16 }).map((_, i) => (
            <motion.div
              key={`sparkle-${i}`}
              className="absolute w-5 h-5 rounded-full"
              style={{
                background: `radial-gradient(circle, ${['#FFD700', '#FF6B6B', '#4ECDC4', '#A855F7', '#F472B6'][i % 5]}, transparent)`,
                left: `${10 + Math.random() * 80}%`,
                top: `${10 + Math.random() * 80}%`,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 2.5, 1.5, 2.5, 0],
                opacity: [0, 1, 0.8, 1, 0],
              }}
              transition={{
                duration: 2.5,
                delay: i * 0.1,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    );
  }

  // Render simple image - FULL SCREEN
  if (isImage) {
    return (
      <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
        <motion.div 
          className="absolute inset-0 bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            initial={{ scale: 0, rotate: -15 }}
            animate={{ 
              scale: [0, 1.2, 1],
              rotate: [0, 10, 0],
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-[80vw] h-[80vh] max-w-[500px] max-h-[500px] flex items-center justify-center drop-shadow-2xl"
          >
            <img 
              src={emoji} 
              alt="Gift" 
              className="w-full h-full object-contain drop-shadow-[0_0_60px_rgba(255,200,100,0.6)]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </motion.div>
        </div>
        
        {/* Sparkle effects for static images */}
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={`sparkle-${i}`}
            className="absolute w-4 h-4 rounded-full"
            style={{
              background: `radial-gradient(circle, ${['#FFD700', '#FF6B6B', '#4ECDC4', '#A855F7'][i % 4]}, transparent)`,
              left: `${15 + Math.random() * 70}%`,
              top: `${15 + Math.random() * 70}%`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 2, 1, 2, 0],
              opacity: [0, 1, 0.8, 1, 0],
            }}
            transition={{
              duration: 1.5,
              delay: i * 0.1,
              repeat: 2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    );
  }

  // Emoji burst animation (original behavior for text emojis)
  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {/* Center Burst Animation */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Main big emoji */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ 
            scale: [0, 2.5, 2],
            rotate: [0, 15, 0],
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="drop-shadow-2xl"
        >
          <span className="text-[120px] drop-shadow-2xl">{emoji}</span>
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
    </div>
  );
});

GiftEmojiAnimationInner.displayName = 'GiftEmojiAnimationInner';

// Wrapper to ensure stable key and prevent re-mounts
export const GiftEmojiAnimation = ({ emoji, count = 1, onComplete }: GiftEmojiAnimationProps) => {
  // CRITICAL: Use stable key based on emoji URL to prevent re-mounting
  const stableKey = useRef(`gift-anim-${Date.now()}-${emoji.slice(-20)}`);
  
  return (
    <GiftEmojiAnimationInner 
      key={stableKey.current}
      emoji={emoji} 
      count={count} 
      onComplete={onComplete} 
    />
  );
};

export default GiftEmojiAnimation;
