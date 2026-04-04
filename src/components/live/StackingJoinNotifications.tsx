import React, { useEffect, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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

// Level-based gradient colors - Professional Bigo/Chamet Style
const getLevelBadgeColor = (level: number) => {
  if (level >= 50) return "bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400";
  if (level >= 30) return "bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500";
  if (level >= 20) return "bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500";
  if (level >= 10) return "bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500";
  return "bg-gradient-to-r from-slate-400 via-gray-500 to-zinc-500";
};

const getLevelTextColor = (level: number) => {
  if (level >= 50) return "text-amber-900";
  return "text-white";
};

// Single join notification item - Bigo/Chamet/Popo professional style
interface JoinNotificationItemProps {
  notification: JoinNotification;
  index: number;
}

const JoinNotificationItem = memo(({ notification, index }: JoinNotificationItemProps) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -150, scale: 0.85 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{
        type: "spring",
        damping: 22,
        stiffness: 350,
        duration: 0.35,
      }}
      className={cn(
        "flex items-center gap-1.5 py-1 px-2.5 rounded-full w-fit",
        "bg-gradient-to-r from-green-500/80 via-emerald-500/75 to-teal-500/70",
        "backdrop-blur-md border border-green-400/40 shadow-lg",
        "shadow-emerald-500/20"
      )}
    >
      {/* Mini Avatar - Circular with border */}
      <div className="relative flex-shrink-0 w-5 h-5 rounded-full overflow-hidden border-[1.5px] border-white/50 shadow-sm">
        <img 
          src={notification.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${notification.userName}`}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      {/* Level Badge - Compact pill style */}
      <div className={cn(
        "px-1.5 py-0.5 rounded-full text-[8px] font-bold shadow-sm flex items-center",
        getLevelBadgeColor(notification.userLevel),
        getLevelTextColor(notification.userLevel)
      )}>
        <span className="drop-shadow-sm">Lv.{notification.userLevel}</span>
      </div>

      {/* Username */}
      <span className="text-white font-semibold text-[11px] truncate max-w-[70px] drop-shadow-md">
        {notification.userName}
      </span>

      {/* Joined text with icon */}
      <span className="text-white/90 text-[10px] whitespace-nowrap flex items-center gap-0.5">
        <span className="text-[10px]">✨</span>
        <span className="italic">joined</span>
      </span>
    </motion.div>
  );
});

JoinNotificationItem.displayName = 'JoinNotificationItem';

// Hook to manage stacking join notifications - max 5 visible, auto-remove after 4s
export function useStackingJoinNotifications() {
  const [notifications, setNotifications] = useState<JoinNotification[]>([]);

  // Auto-remove old notifications after 4 seconds
  useEffect(() => {
    if (notifications.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setNotifications(prev => 
        prev.filter(n => now - n.timestamp < 4000) // Keep only last 4 seconds
      );
    }, 500);

    return () => clearInterval(timer);
  }, [notifications.length]);

  const addNotification = useCallback((notification: Omit<JoinNotification, 'id' | 'timestamp'>) => {
    const newNotification: JoinNotification = {
      ...notification,
      id: `join_${Date.now()}_${notification.userId}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };
    
    setNotifications(prev => {
      // Add new notification and keep max 5
      const updated = [...prev, newNotification];
      if (updated.length > 5) {
        return updated.slice(-5); // Keep only last 5
      }
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return { 
    notifications, 
    addNotification, 
    clearAll,
    count: notifications.length 
  };
}

// Container component that renders the stacking join notifications
interface StackingJoinNotificationsContainerProps {
  notifications: JoinNotification[];
}

export const StackingJoinNotificationsContainer = memo(({ 
  notifications 
}: StackingJoinNotificationsContainerProps) => {
  if (notifications.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 w-full">
      <AnimatePresence mode="popLayout">
        {notifications.map((notification, index) => (
          <JoinNotificationItem
            key={notification.id}
            notification={notification}
            index={index}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});

StackingJoinNotificationsContainer.displayName = 'StackingJoinNotificationsContainer';

// Re-export types for backward compatibility
export type { JoinNotification as StackingJoinNotification };

export default StackingJoinNotificationsContainer;
