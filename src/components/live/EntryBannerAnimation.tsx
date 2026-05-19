import { useState, useEffect, useCallback, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";

interface EntryBannerAnimationProps {
  userName: string;
  userLevel: number;
  avatarUrl?: string;
  animationUrl?: string; // SVGA URL for the Entry Name Bar design
  onComplete?: () => void;
  className?: string;
}

/**
 * Entry Name Bar Animation - FULL SCREEN SVGA banner with user name
 * 
 * CRITICAL: Plays EXACTLY ONCE - no re-renders, no re-initialization
 * Fixed to be TRUE FULL SCREEN like other entry animations
 */
const EntryBannerAnimationInner = memo(({
  userName,
  userLevel,
  avatarUrl,
  animationUrl,
  onComplete,
  className
}: EntryBannerAnimationProps) => {
  const [isVisible, setIsVisible] = useState(true);
  
  // CRITICAL: Prevent re-initialization on re-renders
  const mountedRef = useRef(true);
  const completedRef = useRef(false);
  const animationStartedRef = useRef(false);

  // Handle animation complete - stop audio and dismiss - ONLY ONCE
  const handleAnimationComplete = useCallback(() => {
    if (completedRef.current || !mountedRef.current) {
      console.log('[EntryBannerAnimation] ⚠️ Complete blocked - already completed');
      return;
    }
    completedRef.current = true;
    
    console.log('[EntryBannerAnimation] ✅ Animation complete');
    setIsVisible(false);
    setTimeout(() => {
      onComplete?.();
    }, 200);
  }, [onComplete]);

  // CRITICAL: Empty deps - run ONLY ONCE on mount
  useEffect(() => {
    mountedRef.current = true;
    
    // CRITICAL: Prevent re-initialization on re-renders
    if (animationStartedRef.current) {
      console.log('[EntryBannerAnimation] ⚠️ Already started, skipping re-init');
      return;
    }
    animationStartedRef.current = true;
    
    if (hasCustomAnimation) {
      // SVGA plays for its NATIVE duration ONLY - onComplete handles it
      // No extra timers added
      return () => { mountedRef.current = false; };
    }

    // Non-SVGA (CSS banner) - auto-complete after 3 seconds
    const timer = setTimeout(() => {
      if (mountedRef.current && !completedRef.current) {
        handleAnimationComplete();
      }
    }, 3000);
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []); // CRITICAL: Empty deps - run only ONCE on mount

  // Get level color based on user level
  const getLevelColor = (level: number) => {
    if (level >= 50) return '#FFD700'; // Gold
    if (level >= 30) return '#FF6B6B'; // Red
    if (level >= 20) return '#A855F7'; // Purple
    if (level >= 10) return '#3B82F6'; // Blue
    return '#10B981'; // Green
  };

  // Check if we have a valid SVGA animation URL
  const getCleanExtension = (url: string) => {
    const cleanUrl = url.split('?')[0].split('#')[0];
    return cleanUrl.toLowerCase();
  };
  
  const hasCustomAnimation = animationUrl && getCleanExtension(animationUrl).endsWith('.svga');

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none"
          style={{
            // CRITICAL: TRUE FULL SCREEN positioning
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
          {/* Dark overlay */}
          <motion.div 
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          
          {hasCustomAnimation ? (
            // SVGA Entry Name Bar - TRUE FULL SCREEN
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '100%',
                height: '100%',
                // Scale up to fill screen like other entry animations
                transform: 'translate(-50%, -50%) scale(1.5)',
                transformOrigin: 'center center',
              }}
            >
              <FixedAnimationFrame
                src={animationUrl!}
                size="fill"
                type="svga"
                loop={false}
                muted={false}
                volume={0.8}
                onComplete={handleAnimationComplete}
                center={false}
              />
              
              {/* User Name Overlay - Positioned in CENTER */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-black/40 backdrop-blur-sm"
                >
                  {avatarUrl && (
                    <img 
                      src={avatarUrl} 
                      alt={userName}
                      className="w-12 h-12 rounded-full border-2 border-white/80 shadow-lg"
                    />
                  )}
                  <span 
                    className="text-white font-bold text-xl tracking-wide max-w-[200px] truncate"
                    style={{
                      textShadow: `0 0 10px ${getLevelColor(userLevel)}, 0 0 20px ${getLevelColor(userLevel)}, 0 2px 4px rgba(0,0,0,0.8)`
                    }}
                  >
                    {userName}
                  </span>
                  <span 
                    className="px-3 py-1 rounded-lg text-sm font-black text-white"
                    style={{ 
                      background: `linear-gradient(135deg, ${getLevelColor(userLevel)}, ${getLevelColor(userLevel)}dd)`,
                    }}
                  >
                    Lv{userLevel}
                  </span>
                </motion.div>
              </div>
            </div>
          ) : (
            // Default CSS-styled Premium Flying Banner (when no SVGA)
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                initial={{ x: '-100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: "spring", damping: 20 }}
                className="relative overflow-visible"
              >
                {/* Outer glow */}
                <motion.div 
                  className="absolute -inset-2 rounded-2xl blur-xl opacity-60"
                  style={{ 
                    background: `linear-gradient(135deg, ${getLevelColor(userLevel)}, #ec4899)` 
                  }}
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                
                {/* Main Banner */}
                <div 
                  className="relative flex items-center gap-3 px-6 py-3 rounded-xl"
                  style={{
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(236, 72, 153, 0.95), rgba(249, 115, 22, 0.9))',
                    boxShadow: '0 8px 32px rgba(139, 92, 246, 0.5), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.2)',
                    border: '2px solid rgba(255,255,255,0.3)'
                  }}
                >
                  {/* Leading sparkle */}
                  <motion.div
                    animate={{ rotate: 360, scale: [1, 1.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-yellow-300 text-xl"
                  >
                    ✨
                  </motion.div>

                  {/* Avatar */}
                  {avatarUrl ? (
                    <div className="relative">
                      <div className="absolute inset-0 bg-yellow-400/60 rounded-full blur-sm" />
                      <img 
                        src={avatarUrl} 
                        alt={userName}
                        className="relative w-10 h-10 rounded-full border-2 border-white shadow-lg"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center border-2 border-white shadow-lg">
                      <span className="text-white font-bold text-sm">
                        {userName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Level Badge */}
                  <span 
                    className="px-2.5 py-1 rounded-lg text-xs font-black text-white shadow-lg"
                    style={{ 
                      background: `linear-gradient(135deg, ${getLevelColor(userLevel)}, ${getLevelColor(userLevel)}dd)`,
                      boxShadow: `0 2px 8px ${getLevelColor(userLevel)}80`
                    }}
                  >
                    Lv{userLevel}
                  </span>

                  {/* Username with glow */}
                  <span 
                    className="text-white font-bold text-base tracking-wide"
                    style={{
                      textShadow: '0 2px 8px rgba(0,0,0,0.5)'
                    }}
                  >
                    {userName}
                  </span>

                  {/* Entry text */}
                  <span className="text-yellow-200 text-sm font-semibold">
                    entered
                  </span>

                  {/* Trailing sparkle */}
                  <motion.div
                    animate={{ rotate: -360, scale: [1, 1.4, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                    className="text-yellow-300 text-xl"
                  >
                    ⭐
                  </motion.div>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

EntryBannerAnimationInner.displayName = 'EntryBannerAnimationInner';

// Wrapper to ensure stable key and prevent re-mounts
export const EntryBannerAnimation = ({ 
  userName, 
  userLevel, 
  avatarUrl, 
  animationUrl, 
  onComplete, 
  className 
}: EntryBannerAnimationProps) => {
  // CRITICAL: Use stable key to prevent re-mounting
  const stableKey = useRef(`entry-banner-${Date.now()}-${userName}`);
  
  return (
    <EntryBannerAnimationInner 
      key={stableKey.current}
      userName={userName}
      userLevel={userLevel}
      avatarUrl={avatarUrl}
      animationUrl={animationUrl}
      onComplete={onComplete}
      className={className}
    />
  );
};

export default EntryBannerAnimation;
