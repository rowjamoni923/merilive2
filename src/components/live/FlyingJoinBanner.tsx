import React, { useEffect, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { 
  getLevelGradient, 
  getLevelBadgeBg,
  ensureValidLevel,
  formatLevel 
} from "@/features/shared/level";

// Types for join notification - Bigo/Chamet/Popo style
export interface JoinNotification {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userLevel: number;
  frameId?: string;
  timestamp: number;
}

interface FlyingJoinBannerProps {
  notification: JoinNotification;
  onComplete: () => void;
}

// Banner background gradient (semi-transparent for banner container)
const getBannerGradient = (level: number) => {
  if (level >= 50) return "from-amber-500/90 via-yellow-500/85 to-orange-500/80";
  if (level >= 30) return "from-purple-500/90 via-pink-500/85 to-rose-500/80";
  if (level >= 20) return "from-cyan-500/90 via-blue-500/85 to-indigo-500/80";
  if (level >= 10) return "from-emerald-500/90 via-green-500/85 to-teal-500/80";
  return "from-slate-500/90 via-gray-500/85 to-zinc-500/80";
};

// Flying Join Banner Component - Premium Bigo/Chamet Style
const FlyingJoinBannerInner = memo(({ notification, onComplete }: FlyingJoinBannerProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const level = ensureValidLevel(notification.userLevel);

  // Auto-hide and fly away after 1.5 seconds (like Bigo/Chamet)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 1500);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2000); // Give 500ms for exit animation

    return () => {
      clearTimeout(timer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key={notification.id}
          className="pointer-events-none"
          initial={{ x: -350, opacity: 0, scale: 0.8 }}
          animate={{ 
            x: 0, 
            opacity: 1, 
            scale: 1,
          }}
          exit={{ 
            x: 400, 
            opacity: 0, 
            scale: 0.9,
          }}
          transition={{
            type: "spring",
            damping: 20,
            stiffness: 300,
            duration: 0.4
          }}
        >
          <div className={cn(
            "flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-r-full",
            "bg-gradient-to-r",
            getBannerGradient(level),
            "backdrop-blur-xl border-r border-t border-b border-white/30"
          )}>
            {/* Avatar with Frame - Small but visible */}
            <div className="relative flex-shrink-0">
              <AvatarWithFrame
                userId={notification.userId}
                src={notification.userAvatar}
                name={notification.userName}
                level={level}
                size="sm"
                showFrame={true}
                showAnimation={level >= 20}
                showGlow={level >= 30}
              />
            </div>

            {/* User Info */}
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Level Badge - Using Centralized Utilities */}
              <div className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 shadow-md",
                getLevelBadgeBg(level),
                "text-white"
              )}>
                <span>{formatLevel(level)}</span>
              </div>

              {/* Name */}
              <span className="text-white font-bold text-xs truncate max-w-[80px] drop-shadow-lg">
                {notification.userName}
              </span>

              {/* Joined Text */}
              <span className="text-white/90 text-[10px] italic drop-shadow-md whitespace-nowrap">
                joined 🎉
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

FlyingJoinBannerInner.displayName = 'FlyingJoinBannerInner';

export const FlyingJoinBanner = memo(FlyingJoinBannerInner);

// Hook to manage join notification queue - Bigo/Chamet style (show one at a time)
export function useFlyingJoinNotifications() {
  const [notifications, setNotifications] = useState<JoinNotification[]>([]);
  const [activeNotification, setActiveNotification] = useState<JoinNotification | null>(null);

  // Process queue - show one notification at a time
  useEffect(() => {
    if (!activeNotification && notifications.length > 0) {
      const next = notifications[0];
      setActiveNotification(next);
      setNotifications(prev => prev.slice(1));
    }
  }, [notifications, activeNotification]);

  const addNotification = useCallback((notification: Omit<JoinNotification, 'id' | 'timestamp'>) => {
    const newNotification: JoinNotification = {
      ...notification,
      id: `join_${Date.now()}_${notification.userId}`,
      timestamp: Date.now(),
    };
    setNotifications(prev => [...prev, newNotification]);
  }, []);

  const completeNotification = useCallback(() => {
    setActiveNotification(null);
  }, []);

  return { 
    activeNotification, 
    addNotification, 
    completeNotification,
    queueLength: notifications.length 
  };
}

// Container component that renders the flying join banners
interface FlyingJoinBannerContainerProps {
  activeNotification: JoinNotification | null;
  onComplete: () => void;
}

export const FlyingJoinBannerContainer = memo(({ 
  activeNotification, 
  onComplete 
}: FlyingJoinBannerContainerProps) => {
  if (!activeNotification) return null;

  return (
    <div 
      className="fixed left-0 z-[80] pointer-events-none"
      style={{ top: '30%' }} // Position at 30% from top (below header, above chat)
    >
      <FlyingJoinBanner
        key={activeNotification.id}
        notification={activeNotification}
        onComplete={onComplete}
      />
    </div>
  );
});

FlyingJoinBannerContainer.displayName = 'FlyingJoinBannerContainer';

export default FlyingJoinBanner;
