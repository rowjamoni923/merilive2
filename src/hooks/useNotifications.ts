import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import {
  getLocallyReadAgencyHostRequestIds,
  markAgencyHostRequestAsRead,
  markAgencyHostRequestsAsRead,
} from '@/utils/agencyHostRequestReadState';
import { buildSupportReplyLink } from '@/utils/supportNotificationLink';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Json;
  is_read: boolean;
  created_at: string;
  source?: 'regular' | 'helper' | 'admin_notice' | 'agency_owner';
  priority?: string;
}

export interface AdminNotice {
  id: string;
  title: string;
  message: string;
  target_audience: string[];
  priority: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  read_by: string[];
}

// Sound player for notifications (using Web Audio API)
const playNotificationSound = (type?: string) => {
  try {
    // Check localStorage cache for sound preference
    const soundDisabledCategories = JSON.parse(localStorage.getItem('meri_sound_disabled') || '[]');
    const category = getNotificationCategory(type || '');
    if (soundDisabledCategories.includes(category)) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);

    // Different tones for different notification types
    const isCall = type === 'call_received' || type === 'incoming_call';
    const isMissedCall = type === 'call_missed';
    const isGift = type === 'gift_received' || type === 'gift';
    const isCoins = type?.includes('coin') || type?.includes('diamond') || type === 'topup_approved';

    let frequencies: number[];
    let duration: number;

    if (isCall) {
      frequencies = [784, 988, 784, 988, 784]; // Ringtone pattern
      duration = 0.8;
    } else if (isMissedCall) {
      frequencies = [523, 392]; // Descending tone
      duration = 0.5;
    } else if (isGift) {
      frequencies = [1047, 1319, 1568]; // Ascending sparkle
      duration = 0.4;
    } else if (isCoins) {
      frequencies = [1175, 1397, 1760]; // Ka-ching
      duration = 0.5;
    } else {
      frequencies = [880, 1109, 1319]; // Default pleasant chime
      duration = 0.4;
    }
    
    frequencies.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const noteGain = audioContext.createGain();
      
      oscillator.type = isCall ? 'square' : 'sine';
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
      
      noteGain.gain.setValueAtTime(0.15, audioContext.currentTime + i * 0.08);
      noteGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      
      oscillator.connect(noteGain);
      noteGain.connect(gainNode);
      
      oscillator.start(audioContext.currentTime + i * 0.08);
      oscillator.stop(audioContext.currentTime + duration + 0.1);
    });

    setTimeout(() => { audioContext.close(); }, 1500);
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
};

// Map notification type to category for preference checking
const getNotificationCategory = (type: string): string => {
  if (['gift', 'gift_received', 'gift_sent'].includes(type)) return 'gifts';
  if (['call_missed', 'call_received', 'incoming_call'].includes(type)) return 'calls';
  if (['new_follower', 'follow'].includes(type)) return 'social';
  if (['live_started', 'party_invite', 'room_joined'].includes(type)) return 'live';
  if (['coins_added', 'coin_purchase_helper', 'coin_purchase_direct', 'topup_approved', 'topup_rejected', 'diamonds_credited', 'coins_received', 'payment_completed', 'withdrawal', 'withdrawal_approved', 'withdrawal_rejected', 'beans_exchanged', 'balance_deducted', 'coin_exchange', 'diamond_sent'].includes(type)) return 'transactions';
  if (['level_up', 'reward', 'task_completed', 'daily_bonus'].includes(type)) return 'rewards';
  if (['admin_message', 'admin_message_reply', 'system', 'security'].includes(type)) return 'system';
  if (type.startsWith('agency_')) return 'agency';
  if (['helper_approved', 'helper_rejected', 'payroll_approved', 'payroll_rejected', 'new_topup_order', 'order_completed', 'helper_notification'].includes(type)) return 'helper';
  if (['host_approved', 'host_rejected', 'host_application'].includes(type)) return 'host';
  return 'general';
};

// Get emoji icon based on notification type
const getNotificationIcon = (type: string): string => {
  const iconMap: Record<string, string> = {
    gift_received: '🎁', gift_sent: '🎁', gift: '🎁',
    new_follower: '👤', follow: '👤',
    level_up: '🎉', level_upgrade: '🎉', level_upgrade_approved: '🎉', level_upgrade_rejected: '❌',
    coins_added: '💎', coin_purchase_helper: '💎', coin_purchase_direct: '💎', diamonds_credited: '💎',
    coins_received: '💎', diamond_received: '💎', diamond_sent: '💎',
    withdrawal_approved: '✅', withdrawal_rejected: '❌', withdrawal: '⏳', withdrawal_commission: '💎',
    host_approved: '🎉', host_rejected: '❌',
    live_started: '🔴', party_invite: '🎉',
    call_missed: '📞', call_received: '📞',
    reward: '🏆', task_completed: '✅', daily_bonus: '🎁',
    beans_exchanged: '💎', balance_deducted: '⚠️',
    admin_message: '📢', admin_message_reply: '💬',
    system: '⚙️', security: '🔒',
    message: '💬',
    // Helper & Payroll notifications
    helper_approved: '✅', helper_rejected: '❌',
    payroll_approved: '✅', payroll_rejected: '❌',
    topup_approved: '💎', topup_rejected: '❌',
    new_topup_order: '💎', new_withdrawal_request: '💰',
    order_completed: '✅', helper_notification: '🔔',
    coin_exchange: '💱', payment_completed: '✅', payment_pending: '⏳',
    report_resolved: '🛡️', admin_warning: '⚠️',
    // Agency notifications
    agency_host_request: '👥',
    agency_host_added: '✅',
    agency_host_rejected: '❌',
    agency_host_left: '👋',
    agency_created: '🏢',
    agency_approved: '✅',
    agency_joined: '🤝',
    agency_verification: '🔐',
    agency_withdrawal: '💰',
    agency_withdrawal_approved: '✅',
    agency_withdrawal_rejected: '❌',
    agency_withdrawal_processing: '⏳',
    agency_commission: '💎',
    agency_diamond_received: '💎',
    agency_level_up: '🏆',
  };
  return iconMap[type] || '🔔';
};

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [helperId, setHelperId] = useState<string | null>(null);
  const [ownedAgencyId, setOwnedAgencyId] = useState<string | null>(null);
  const hasInteractedRef = useRef(false);

  const emitGlobalUnreadRefresh = useCallback((detail?: { notificationsDecrement?: number; notificationsSetZero?: boolean }) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('global-unread:refresh', { detail }));
    }
  }, []);

  // Track user interaction for audio policy - set immediately for native apps
  useEffect(() => {
    // In Capacitor native app, audio is always allowed
    if ((window as any).Capacitor?.isNativePlatform()) {
      hasInteractedRef.current = true;
      return;
    }
    
    const handleInteraction = () => {
      hasInteractedRef.current = true;
    };
    
    // Listen on multiple events to ensure we catch the first interaction
    const events = ['click', 'touchstart', 'keydown'];
    events.forEach(event => {
      window.addEventListener(event, handleInteraction, { once: true });
    });
    
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleInteraction);
      });
    };
  }, []);

  // Admin-only notification types that should NOT appear in the user app
  // NOTE: agency_withdrawal, agency_* types are ALLOWED - they must show for agency owners
  const ADMIN_ONLY_TYPES = [
    'verification', 'host_application', 'support', 'helper_application',
    'helper_upgrade', 'helper_topup', 'admin_alert'
  ];

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!currentUserId) return;

     // Fetch regular notifications (excluding admin-only types)
     const { data: regularData, error: regularError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', currentUserId)
      .eq('is_read', false)
      .not('type', 'in', `(${ADMIN_ONLY_TYPES.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(50);

     let allNotifications: Notification[] = [];

     if (!regularError && regularData) {
       allNotifications = regularData.map(n => ({ ...n, source: 'regular' as const }));
     }

     // If user is a helper (any level 1-5), also fetch helper notifications
     if (helperId) {
       const { data: helperData, error: helperError } = await supabase
         .from('helper_notifications')
         .select('*')
         .eq('helper_id', helperId)
          .eq('is_read', false)
         .order('created_at', { ascending: false })
         .limit(50);

       if (!helperError && helperData) {
         const helperNotifications: Notification[] = helperData.map((n: any) => ({
           id: n.id,
           user_id: currentUserId,
           type: n.type || 'helper_notification',
           title: n.title,
           message: n.message,
           data: n.data || {},
           is_read: n.is_read,
           created_at: n.created_at,
           source: 'helper' as const
         }));
         allNotifications = [...allNotifications, ...helperNotifications];
       }
    }

     // Admin notices are shown ONLY in the Official tab (OfficialNoticeList),
     // so we do NOT include them in the regular notifications list.

     // Sort all by date
     allNotifications.sort((a, b) => {
       return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
     });

      setNotifications(allNotifications);
      setUnreadCount(allNotifications.length);
    setLoading(false);
   }, [currentUserId, helperId]);

  // Initialize
  useEffect(() => {
    const initUser = async () => {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
      if (user) {
        setCurrentUserId(user.id);

         // Check if user is a helper (ANY level 1-5, verified or not)
         const { data: helperData } = await supabase
           .from('topup_helpers')
           .select('id')
           .eq('user_id', user.id)
           .maybeSingle();

         if (helperData) {
           setHelperId(helperData.id);
         }
      }
    };
    initUser();
  }, []);

  // Fetch on user change or when helperId becomes available
  useEffect(() => {
    if (currentUserId) {
      fetchNotifications();
    }
  }, [currentUserId, helperId, fetchNotifications]);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!currentUserId) return;

    console.log('Subscribing to notifications for user:', currentUserId);

    const channels: any[] = [];
    const uniqueSuffix = Date.now();

    // Regular notifications channel
    const regularChannel = supabase
      .channel(`notifications-regular-${currentUserId}-${uniqueSuffix}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`
        },
        (payload) => {
          const newNotification = { ...payload.new as Notification, source: 'regular' as const };
          // Skip admin-only notification types in the user app
          if (ADMIN_ONLY_TYPES.includes(newNotification.type) || newNotification.is_read) return;
          console.log('New notification received:', payload);
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);

          // Play notification sound if user has interacted
          if (hasInteractedRef.current) {
            playNotificationSound(newNotification.type);
          }

          // Show visible toast popup
          const actionUrl = newNotification.type === 'support_reply'
            ? buildSupportReplyLink(newNotification.data as any)
            : ((newNotification.data as any)?.action_url || null);

          toast(newNotification.title, {
            description: newNotification.message?.substring(0, 120),
            duration: 6000,
            icon: getNotificationIcon(newNotification.type),
            action: actionUrl ? {
              label: 'View',
              onClick: () => {
                window.location.href = actionUrl;
              }
            } : undefined,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe((status) => {
        console.log('Notification subscription status:', status);
      });

    channels.push(regularChannel);

    // Helper notifications channel (if user is a helper)
    if (helperId) {
      const helperChannel = supabase
        .channel(`notifications-helper-${helperId}-${uniqueSuffix}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'helper_notifications',
            filter: `helper_id=eq.${helperId}`
          },
          (payload) => {
            console.log('New helper notification received:', payload);
            const helperNotif = payload.new as any;
            if (helperNotif.is_read) return;
            const newNotification: Notification = {
              id: helperNotif.id,
              user_id: currentUserId,
              type: helperNotif.type || 'helper_notification',
              title: helperNotif.title,
              message: helperNotif.message,
              data: helperNotif.data || {},
              is_read: helperNotif.is_read,
              created_at: helperNotif.created_at,
              source: 'helper' as const
            };
            setNotifications(prev => [newNotification, ...prev]);
            setUnreadCount(prev => prev + 1);

            if (hasInteractedRef.current) {
              playNotificationSound(newNotification.type);
            }

            // Show visible toast popup for helper notifications
            toast(newNotification.title, {
              description: newNotification.message?.substring(0, 120),
              duration: 6000,
              icon: getNotificationIcon(newNotification.type),
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'helper_notifications',
            filter: `helper_id=eq.${helperId}`
          },
          () => {
            fetchNotifications();
          }
        )
        .subscribe((status) => {
          console.log('Helper notification subscription status:', status);
        });

      channels.push(helperChannel);
    }

    // Admin notices are handled by OfficialNoticeList component separately

    return () => {
      console.log('Unsubscribing from notifications');
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [currentUserId, helperId, fetchNotifications]);

  // Mark as read
  const markAsRead = async (notificationId: string) => {
    const notif = notifications.find(n => n.id === notificationId);
    if (!notif || notif.is_read) return;

    const previousNotifications = notifications;

    // Optimistic UI update
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setUnreadCount(prev => Math.max(0, prev - 1));
    emitGlobalUnreadRefresh({ notificationsDecrement: 1 });

    try {
      if (notif.source === 'helper') {
        let query = supabase
          .from('helper_notifications')
          .update({ is_read: true })
          .eq('id', notificationId);

        if (helperId) {
          query = query.eq('helper_id', helperId);
        }

        const { error } = await query;
        if (error) throw error;
      } else {
        let query = supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId);

        if (currentUserId) {
          query = query.eq('user_id', currentUserId);
        }

        const { error } = await query;
        if (error) throw error;
      }

      emitGlobalUnreadRefresh();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      setNotifications(previousNotifications);
      setUnreadCount(previousNotifications.length);
      emitGlobalUnreadRefresh();
      fetchNotifications();
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    if (!currentUserId) return;

    const previousNotifications = notifications;

    // Optimistic UI update
    setNotifications([]);
    setUnreadCount(0);
    emitGlobalUnreadRefresh({ notificationsSetZero: true });

    try {
      // Mark regular notifications as read
      const { error: regularError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', currentUserId)
        .eq('is_read', false);

      if (regularError) throw regularError;

      // Mark helper notifications as read if helper
      if (helperId) {
        const { error: helperError } = await supabase
          .from('helper_notifications')
          .update({ is_read: true })
          .eq('helper_id', helperId)
          .eq('is_read', false);

        if (helperError) throw helperError;
      }

      emitGlobalUnreadRefresh();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      setNotifications(previousNotifications);
      setUnreadCount(previousNotifications.length);
      emitGlobalUnreadRefresh();
      fetchNotifications();
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications
  };
};
