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

// Pkg424 — Tier-based hold duration. Premium users get a longer spotlight on screen,
// matching Bigo Noble cadence (Baron ~5s; everyone else 2.1s default).
const getHoldDurationMs = (level: number): number => {
  if (level >= 60) return 5000; // Legendary — full Baron-class spotlight
  if (level >= 40) return 3500; // Epic
  if (level >= 20) return 2800; // Platinum/Gold extended
  return 2100;                  // Default (matches prior cadence)
};

const BigoStyleBannerInner = memo(({ notification, onComplete }: BigoStyleBannerProps) => {
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting'>('entering');
  const level = ensureValidLevel(notification.userLevel);

  useEffect(() => {
    // Pkg424: Pro Bigo cadence — enter ~280ms, tier-based hold, exit ~420ms.
    const ENTER_MS = 280;
    const EXIT_MS = 420;
    const holdMs = getHoldDurationMs(level);
    const visibleTimer = setTimeout(() => setPhase('visible'), ENTER_MS);
    const exitTimer = setTimeout(() => setPhase('exiting'), ENTER_MS + holdMs);
    const completeTimer = setTimeout(() => onComplete(), ENTER_MS + holdMs + EXIT_MS);
    return () => {
      clearTimeout(visibleTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete, level]);

  return (
    <motion.div
      className="pointer-events-none"
      initial={{ x: '-110%', opacity: 0, scale: 0.9 }}
      animate={phase === 'exiting'
        ? { x: '130%', opacity: 0, scale: 0.92 }
        : { x: 0, opacity: 1, scale: 1 }
      }
      transition={{
        type: "spring",
        damping: phase === 'exiting' ? 18 : 26,
        stiffness: phase === 'exiting' ? 220 : 280,
        mass: 0.75,
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
            "px-2 py-0.5 rounded-md text-[10px] font-black shadow-lg flex items-center gap-0.5 tracking-wide",
            getLevelBadgeBg(level),
            getLevelTextColor(level)
          )}>
            {level >= 50 && <span className="text-[10px] leading-none">👑</span>}
            {level >= 30 && level < 50 && <span className="text-[10px] leading-none">💎</span>}
            <span className="drop-shadow-sm tabular-nums">{formatLevel(level)}</span>
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
              }}
              transition={{ 
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
    const incomingLevel = ensureValidLevel(newNotification.userLevel);
    setQueue(prev => {
      const HIGH_TIER = 40; // Epic+ pre-empt the queue (matches Bigo Noble preempt)
      const MAX_QUEUE = 8;  // Hard cap so viral bursts don't pile up minutes of banners
      // VIP/Noble (level >= HIGH_TIER): jump to the front, after any other VIPs already queued
      if (incomingLevel >= HIGH_TIER) {
        const lastVipIdx = prev.reduce(
          (acc, n, i) => (ensureValidLevel(n.userLevel) >= HIGH_TIER ? i : acc),
          -1
        );
        const next = [...prev];
        next.splice(lastVipIdx + 1, 0, newNotification);
        // Trim from the tail (always the lowest-priority regular users)
        return next.length > MAX_QUEUE ? next.slice(0, MAX_QUEUE) : next;
      }
      // Regular user: append, but if cap hit, drop the OLDEST regular (never drop a VIP)
      const next = [...prev, newNotification];
      if (next.length <= MAX_QUEUE) return next;
      const firstRegularIdx = next.findIndex(n => ensureValidLevel(n.userLevel) < HIGH_TIER);
      if (firstRegularIdx === -1) {
        // All slots are VIPs — drop the new regular silently
        return prev;
      }
      next.splice(firstRegularIdx, 1);
      return next;
    });
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
