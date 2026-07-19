import React, { useEffect, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";

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

/* ─────────────────────────────────────────────────────────────
   Level-tier palette — Bigo/Chamet parity
   ───────────────────────────────────────────────────────────── */
type Tier = {
  bg: string;
  border: string;
  shadow: string;
  glow: string;
  textBadge: string;
  icon: string;
  premium: boolean;
};

const getTier = (level: number): Tier => {
  if (level >= 50)
    return {
      bg: "linear-gradient(110deg, rgba(251,191,36,0.92), rgba(245,158,11,0.88), rgba(234,88,12,0.85))",
      border: "rgba(253,224,71,0.7)",
      shadow: "0 8px 24px rgba(251,191,36,0.45), 0 0 0 1px rgba(253,224,71,0.3) inset",
      glow: "rgba(251,191,36,0.6)",
      textBadge: "text-amber-900",
      icon: "👑",
      premium: true,
    };
  if (level >= 30)
    return {
    };
  if (level >= 20)
    return {
    };
  if (level >= 10)
    return {
    };
  return {
  };
};

/* ─────────────────────────────────────────────────────────────
   Single join notification item — premium polish
   ───────────────────────────────────────────────────────────── */
interface JoinNotificationItemProps {
  notification: JoinNotification;
  index: number;
}

const JoinNotificationItem = memo(({ notification, index }: JoinNotificationItemProps) => {
  const tier = getTier(notification.userLevel);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: -120, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95, filter: "blur(2px)" }}
      transition={{
        type: "spring",
        damping: 26,
        stiffness: 420,
        mass: 0.55,
        delay: Math.min(index * 0.03, 0.1),
      }}
      className="flex items-center gap-1 py-[2px] pl-[2px] pr-2 rounded-full w-fit relative overflow-hidden will-change-transform"
      style={{
        background: "rgba(0,0,0,0.42)",
        border: `1px solid ${tier.border}`,
        boxShadow: `0 2px 8px rgba(0,0,0,0.35)`,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
      }}
    >
      {/* Avatar — tiny Chamet-style */}
      <div
        className="relative flex-shrink-0 w-[14px] h-[14px] rounded-full overflow-hidden"
        style={{ boxShadow: `0 0 4px ${tier.glow}` }}
      >
        <img
          loading="lazy"
          decoding="async"
          src={notification.userAvatar || getDisplayAvatar(notification.userName)}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      {/* Username + joined — single ultra-compact line */}
      <span className="text-white/95 text-[9.5px] leading-none font-semibold truncate max-w-[110px] drop-shadow-sm">
        {notification.userName}
        <span className="text-white/60 font-normal ml-1">joined</span>
      </span>
    </motion.div>
  );
});

JoinNotificationItem.displayName = "JoinNotificationItem";

/* ─────────────────────────────────────────────────────────────
   Hook — manage stacking notifications
   Bigo/Chamet parity: max 5 visible, snappy 3.2s auto-dismiss
   ───────────────────────────────────────────────────────────── */
const MAX_VISIBLE = 4;
const DISMISS_MS = 2600;

export function useStackingJoinNotifications() {
  const [notifications, setNotifications] = useState<JoinNotification[]>([]);

  useEffect(() => {
    if (notifications.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setNotifications((prev) => prev.filter((n) => now - n.timestamp < DISMISS_MS));
    }, 300);
    return () => clearInterval(timer);
  }, [notifications.length]);

  const addNotification = useCallback(
    (notification: Omit<JoinNotification, "id" | "timestamp">) => {
      const newNotification: JoinNotification = {
        ...notification,
        id: `join_${Date.now()}_${notification.userId}_${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
      };
      setNotifications((prev) => {
        const updated = [...prev, newNotification];
        return updated.length > MAX_VISIBLE ? updated.slice(-MAX_VISIBLE) : updated;
      });
    },
    []
  );

  const clearAll = useCallback(() => setNotifications([]), []);

  return {
    notifications,
    addNotification,
    clearAll,
    count: notifications.length,
  };
}

/* ─────────────────────────────────────────────────────────────
   Container — FIFO stack with popLayout for smooth re-order
   ───────────────────────────────────────────────────────────── */
interface StackingJoinNotificationsContainerProps {
  notifications: JoinNotification[];
}

export const StackingJoinNotificationsContainer = memo(
  ({ notifications }: StackingJoinNotificationsContainerProps) => {
    if (notifications.length === 0) return null;

    return (
      <div
        className="flex flex-col gap-1 w-full will-change-transform"
        style={{ transform: "translateZ(0)" }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
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
  }
);

StackingJoinNotificationsContainer.displayName = "StackingJoinNotificationsContainer";

// Re-export types for backward compatibility
export type { JoinNotification as StackingJoinNotification };

export default StackingJoinNotificationsContainer;
