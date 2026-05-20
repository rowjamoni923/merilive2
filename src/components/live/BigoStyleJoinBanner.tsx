import React, { useEffect, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";
import { 
  getLevelGradient, 
  getLevelBadgeBg, 
  getLevelTextColor,
  ensureValidLevel,
  formatLevel 
} from "@/features/shared/level";

// ============= TYPES =============
export interface JoinNotification {
  id: string;
  oderId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userLevel: number;
  timestamp: number;
}

// ============= LEVEL-BASED STYLING - Bigo/Chamet Professional =============
const getLevelBannerBg = (level: number) => {
  // Premium tier gradients matching Bigo Live exactly - Uses centralized level utils
  if (level >= 60) return "from-amber-500 via-yellow-400 to-orange-400"; // Legendary Gold
  if (level >= 50) return "from-rose-500 via-pink-400 to-fuchsia-400"; // Mythic Pink
  if (level >= 40) return "from-purple-500 via-violet-400 to-indigo-400"; // Epic Purple
  if (level >= 30) return "from-cyan-500 via-sky-400 to-blue-400"; // Diamond Blue
  if (level >= 20) return "from-emerald-500 via-green-400 to-teal-400"; // Platinum Green
  if (level >= 10) return "from-blue-500 via-indigo-400 to-violet-400"; // Gold Blue
  return "from-slate-500 via-gray-400 to-zinc-400"; // Silver Gray
};

const getAvatarGlow = (level: number) => {
  if (level >= 60) return "shadow-[0_0_12px_rgba(251,191,36,0.8)]";
  if (level >= 50) return "shadow-[0_0_12px_rgba(236,72,153,0.7)]";
  if (level >= 40) return "shadow-[0_0_10px_rgba(139,92,246,0.6)]";
  if (level >= 30) return "shadow-[0_0_10px_rgba(34,211,238,0.6)]";
  if (level >= 20) return "shadow-[0_0_8px_rgba(16,185,129,0.5)]";
  return "shadow-md";
};

// ============= SINGLE FLYING BANNER - Bigo Live Style =============
interface BigoStyleBannerProps {
  notification: JoinNotification;
  onComplete: () => void;
}

const BigoStyleBannerInner = memo(({ notification, onComplete }: BigoStyleBannerProps) => {
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting'>('entering');
  const level = ensureValidLevel(notification.userLevel);

  useEffect(() => {
    // Phase 1: Enter (already happening via initial animation)
    const visibleTimer = setTimeout(() => {
      setPhase('visible');
    }, 200);

    // Phase 2: Start exit after 0.8 seconds
    const exitTimer = setTimeout(() => {
      setPhase('exiting');
    }, 800);

    // Phase 3: Complete after exit animation
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 1200);

    return () => {
      clearTimeout(visibleTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <motion.div
      className="pointer-events-none"
      initial={{ x: '-100%', opacity: 0, scale: 0.85 }}
      animate={phase === 'exiting' 
        ? { x: '120%', opacity: 0, scale: 0.9 }
        : { x: 0, opacity: 1, scale: 1 }
      }
      transition={{
        type: "spring",
        damping: phase === 'exiting' ? 15 : 22,
        stiffness: phase === 'exiting' ? 200 : 320,
        mass: 0.7,
      }}
    >
      <div className={cn(
        "flex items-center gap-2.5 py-2 pl-2 pr-4 rounded-r-2xl",
        "bg-gradient-to-r",
        getLevelBannerBg(level),
        "backdrop-blur-xl",
        "border-t-2 border-r-2 border-b-2 border-white/40"
      )}>
        {/* Avatar with Premium Glow */}
        <div className="relative flex-shrink-0">
          {/* Animated pulse ring for high levels */}
          {level >= 30 && (
            <motion.div
              className={cn(
                "absolute -inset-1 rounded-full bg-white/30",
              )}
              animate={{ 
                scale: [1, 1.3, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{ 
                duration: 1.2, 
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          )}
          <Avatar className={cn(
            "w-9 h-9 relative border-2 border-white",
            getAvatarGlow(level)
          )}>
            <AvatarImage 
              src={notification.userAvatar || getDisplayAvatar(notification.userName)}
              alt={notification.userName}
              className="object-cover"
            />
            <AvatarFallback className="bg-gradient-to-br from-violet-600 to-purple-700 text-white text-sm font-bold">
              {notification.userName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* User Info Section */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Level Badge - Bigo Style - Using Centralized Utilities */}
          <div className={cn(
            "px-2 py-0.5 rounded-md text-[10px] font-black shadow-lg flex items-center",
            getLevelBadgeBg(level),
            getLevelTextColor(level)
          )}>
            <span className="drop-shadow-sm">{formatLevel(level)}</span>
          </div>

          {/* Username */}
          <span className="text-white font-bold text-sm truncate max-w-[100px] drop-shadow-lg">
            {notification.userName}
          </span>

          {/* Sparkle + "joined the room" - Bigo/Chamet/Popo Style */}
          <div className="flex items-center gap-1">
            <motion.span 
              className="text-base"
              animate={{ 
                rotate: [0, 20, -20, 0],
                scale: [1, 1.3, 1],
              }}
              transition={{ 
                duration: 0.5, 
                repeat: 3,
                ease: "easeInOut"
              }}
            >
              ✨
            </motion.span>
            <span className="text-white font-semibold text-[11px] whitespace-nowrap drop-shadow-md">
              joined the room
            </span>
          </div>
        </div>

        {/* Shine effect overlay */}
        <motion.div
          className="absolute inset-0 rounded-r-2xl pointer-events-none overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ duration: 0.8, delay: 0.3 }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
});

BigoStyleBannerInner.displayName = 'BigoStyleBannerInner';

// ============= HOOK: useBigoJoinNotifications =============
export function useBigoJoinNotifications() {
  const [queue, setQueue] = useState<JoinNotification[]>([]);
  const [activeNotification, setActiveNotification] = useState<JoinNotification | null>(null);

  // Process queue - show one at a time like Bigo
  useEffect(() => {
    if (!activeNotification && queue.length > 0) {
      const next = queue[0];
      setActiveNotification(next);
      setQueue(prev => prev.slice(1));
    }
  }, [queue, activeNotification]);

  const addNotification = useCallback((notification: Omit<JoinNotification, 'id' | 'timestamp'>) => {
    const newNotification: JoinNotification = {
      ...notification,
      id: `bigo_join_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    setQueue(prev => [...prev, newNotification]);
  }, []);

  const completeNotification = useCallback(() => {
    setActiveNotification(null);
  }, []);

  const clearAll = useCallback(() => {
    setQueue([]);
    setActiveNotification(null);
  }, []);

  return { 
    activeNotification, 
    addNotification, 
    completeNotification, 
    clearAll,
    queueLength: queue.length 
  };
}

// ============= CONTAINER COMPONENT - Positioned on Screen =============
interface BigoJoinBannerContainerProps {
  activeNotification: JoinNotification | null;
  onComplete: () => void;
}

export const BigoJoinBannerContainer = memo(({ 
  activeNotification, 
  onComplete 
}: BigoJoinBannerContainerProps) => {
  if (!activeNotification) return null;

  return (
    <div 
      className="fixed left-0 z-[85] pointer-events-none"
      style={{ top: '28%' }} // Position at 28% from top - visible but not blocking video
    >
      <AnimatePresence mode="wait">
        <BigoStyleBannerInner
          key={activeNotification.id}
          notification={activeNotification}
          onComplete={onComplete}
        />
      </AnimatePresence>
    </div>
  );
});

BigoJoinBannerContainer.displayName = 'BigoJoinBannerContainer';

// ============= EXPORTS =============
export { BigoStyleBannerInner as BigoStyleJoinBanner };
export default BigoJoinBannerContainer;
