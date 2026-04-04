/**
 * =====================================================
 * UNIFIED JOIN NOTIFICATION HOOK
 * =====================================================
 * 
 * ONE LINK = ONE CHANGE = BOTH PARTY ROOM & LIVE STREAM UPDATED
 * 
 * This hook manages join notifications for BOTH:
 * - Live Streams
 * - Party Rooms (Audio, Video, Game)
 * 
 * =====================================================
 */

import { useState, useCallback, useEffect } from 'react';
import { JoinNotification, UseFlyingJoinBannerReturn } from './types';

/**
 * Hook for stacking join notifications (shown in chat area)
 * - Used for chat-style join messages that stack
 * - Auto-removes after 3.5 seconds
 */
export function useStackingJoinNotifications() {
  const [notifications, setNotifications] = useState<JoinNotification[]>([]);

  // Auto-remove after 3.5 seconds
  useEffect(() => {
    if (notifications.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setNotifications(prev => prev.filter(n => now - n.timestamp < 1200));
    }, 300);

    return () => clearInterval(timer);
  }, [notifications.length]);

  const addNotification = useCallback((notification: Omit<JoinNotification, 'id' | 'timestamp'>) => {
    const newNotification: JoinNotification = {
      ...notification,
      id: `stacking_join_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    
    setNotifications(prev => {
      const updated = [...prev, newNotification];
      return updated.length > 6 ? updated.slice(-6) : updated; // Keep max 6
    });
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  return { notifications, addNotification, clearAll };
}

/**
 * Hook for flying join banner (Bigo-style, one at a time)
 * - Shows one notification at a time
 * - Queues multiple notifications
 * - Professional flying animation from left
 */
export function useFlyingJoinBanner(): UseFlyingJoinBannerReturn {
  const [queue, setQueue] = useState<JoinNotification[]>([]);
  const [activeNotification, setActiveNotification] = useState<JoinNotification | null>(null);

  // Process queue - show one at a time
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
      id: `flying_join_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
