import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLocallyReadOfficialNoticeIds } from '@/utils/officialNoticeReadState';

interface UnreadCounts {
  messages: number;
  official: number;
  notifications: number;
  groups: number;
  total: number;
}

// NOTE: agency_withdrawal, agency_* types are ALLOWED - they must show for agency owners
const ADMIN_ONLY_TYPES = [
  'verification', 'host_application', 'support', 'helper_application',
  'helper_upgrade', 'helper_topup', 'admin_alert'
];

interface GlobalUnreadRefreshDetail {
  messagesDecrement?: number;
  messagesSetZero?: boolean;
  officialDecrement?: number;
  officialSetZero?: boolean;
  notificationsDecrement?: number;
  notificationsSetZero?: boolean;
}

const EMPTY_COUNTS: UnreadCounts = {
  messages: 0,
  official: 0,
  notifications: 0,
  groups: 0,
  total: 0,
};

const MIN_FETCH_INTERVAL_MS = 800;

type CountsListener = (counts: UnreadCounts) => void;

let sharedUserId: string | null = null;
let sharedUserInitPromise: Promise<void> | null = null;
let sharedCounts: UnreadCounts = EMPTY_COUNTS;
let sharedFetchPromise: Promise<void> | null = null;
let sharedRefreshTimer: number | null = null;
let lastFetchAt = 0;
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
const listeners = new Set<CountsListener>();

const emitCounts = () => {
  listeners.forEach((listener) => {
    try {
      listener(sharedCounts);
    } catch {
      // ignore listener errors
    }
  });
};

const setSharedCounts = (next: UnreadCounts) => {
  sharedCounts = next;
  emitCounts();
};

const scheduleSharedCountsRefresh = (delayMs = 500) => {
  if (typeof window === 'undefined') return;

  if (sharedRefreshTimer) {
    window.clearTimeout(sharedRefreshTimer);
  }

  sharedRefreshTimer = window.setTimeout(() => {
    sharedRefreshTimer = null;
    void fetchSharedCounts(true);
  }, delayMs);
};

const ensureUserId = async () => {
  if (sharedUserId) return;
  if (sharedUserInitPromise) {
    await sharedUserInitPromise;
    return;
  }

  sharedUserInitPromise = (async () => {
    try {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const cachedUser = await getCachedUser();
      if (cachedUser?.id) {
        sharedUserId = cachedUser.id;
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        sharedUserId = session.user.id;
      }
    } finally {
      sharedUserInitPromise = null;
    }
  })();

  await sharedUserInitPromise;
};

const computeCounts = async (userId: string): Promise<UnreadCounts> => {
  // Check if user is a helper (any level 1-5)
  const { data: helperData } = await supabase
    .from('topup_helpers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  const helperId = helperData?.id || null;

  const [messagesRes, officialRes, notificationsRes, helperNotifRes] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, participant1_id, participant2_id')
      .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`),

    supabase.rpc('get_user_notices', { p_user_id: userId }),

    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .not('type', 'in', `(${ADMIN_ONLY_TYPES.join(',')})`),

    // Count unread helper notifications (for any level helper)
    helperId
      ? supabase
          .from('helper_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('helper_id', helperId)
          .eq('is_read', false)
      : Promise.resolve({ count: 0 }),
  ]);

  let messageUnread = 0;
  if (messagesRes.data) {
    const convIds = messagesRes.data.map((c) => c.id);
    if (convIds.length > 0) {
      const { count } = await supabase
        .from('messages')
        .select('conversation_id', { count: 'exact', head: true })
        .in('conversation_id', convIds)
        .neq('sender_id', userId)
        .eq('is_read', false);
      messageUnread = count || 0;
    }
  }

  let officialUnread = 0;
  if (officialRes.data) {
    const locallyReadIds = getLocallyReadOfficialNoticeIds(userId);
    officialUnread = (officialRes.data as any[]).filter(
      (n) => !n.read_by?.includes(userId) && !locallyReadIds.has(n.id)
    ).length;
  }

  const notifUnread = (notificationsRes.count || 0) + ((helperNotifRes as any).count || 0);

  return {
    messages: messageUnread,
    official: officialUnread,
    notifications: notifUnread,
    groups: 0,
    total: messageUnread + officialUnread + notifUnread,
  };
};

const fetchSharedCounts = async (force = false) => {
  await ensureUserId();

  if (!sharedUserId) {
    if (sharedCounts.total !== 0) setSharedCounts(EMPTY_COUNTS);
    return;
  }

  const now = Date.now();
  if (!force && now - lastFetchAt < MIN_FETCH_INTERVAL_MS) {
    return;
  }

  if (sharedFetchPromise) {
    await sharedFetchPromise;
    return;
  }

  sharedFetchPromise = (async () => {
    try {
      const next = await computeCounts(sharedUserId as string);
      setSharedCounts(next);
      lastFetchAt = Date.now();
    } catch {
      // ignore and keep stale counts
    } finally {
      sharedFetchPromise = null;
    }
  })();

  await sharedFetchPromise;
};

const ensureRealtimeSubscription = () => {
  if (!sharedUserId || sharedChannel) return;

  sharedChannel = supabase
    .channel(`global-unread-shared-${sharedUserId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `participant1_id=eq.${sharedUserId}` }, () => {
      void fetchSharedCounts(true);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `participant2_id=eq.${sharedUserId}` }, () => {
      void fetchSharedCounts(true);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${sharedUserId}` }, () => {
      void fetchSharedCounts(true);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
      void fetchSharedCounts(true);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
      void fetchSharedCounts(true);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notices' }, () => {
      void fetchSharedCounts(true);
    })
    .subscribe();
};

const cleanupRealtimeSubscriptionIfUnused = () => {
  if (listeners.size > 0 || !sharedChannel) return;
  supabase.removeChannel(sharedChannel);
  sharedChannel = null;

  if (sharedRefreshTimer && typeof window !== 'undefined') {
    window.clearTimeout(sharedRefreshTimer);
    sharedRefreshTimer = null;
  }
};

export const useGlobalUnreadCount = () => {
  const [counts, setCounts] = useState<UnreadCounts>(sharedCounts);

  useEffect(() => {
    listeners.add(setCounts);
    setCounts(sharedCounts);

    const init = async () => {
      await fetchSharedCounts();
      ensureRealtimeSubscription();
    };

    void init();

    return () => {
      listeners.delete(setCounts);
      cleanupRealtimeSubscriptionIfUnused();
    };
  }, []);

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<GlobalUnreadRefreshDetail>).detail;

      const hasOptimisticDetail = Boolean(
        detail?.messagesSetZero ||
        detail?.messagesDecrement ||
        detail?.officialSetZero ||
        detail?.officialDecrement ||
        detail?.notificationsSetZero ||
        detail?.notificationsDecrement
      );

      if (hasOptimisticDetail) {
        const next: UnreadCounts = { ...sharedCounts };

        if (detail.messagesSetZero) {
          next.total = Math.max(0, next.total - next.messages);
          next.messages = 0;
        } else if (detail.messagesDecrement) {
          const dec = Math.min(next.messages, detail.messagesDecrement);
          next.messages = Math.max(0, next.messages - dec);
          next.total = Math.max(0, next.total - dec);
        }

        if (detail.officialSetZero) {
          next.total = Math.max(0, next.total - next.official);
          next.official = 0;
        } else if (detail.officialDecrement) {
          const dec = Math.min(next.official, detail.officialDecrement);
          next.official = Math.max(0, next.official - dec);
          next.total = Math.max(0, next.total - dec);
        }

        if (detail.notificationsSetZero) {
          next.total = Math.max(0, next.total - next.notifications);
          next.notifications = 0;
        } else if (detail.notificationsDecrement) {
          const dec = Math.min(next.notifications, detail.notificationsDecrement);
          next.notifications = Math.max(0, next.notifications - dec);
          next.total = Math.max(0, next.total - dec);
        }

        setSharedCounts(next);
      }

      if (hasOptimisticDetail) {
        scheduleSharedCountsRefresh();
        return;
      }

      void fetchSharedCounts(true);
    };

    window.addEventListener('global-unread:refresh', handleRefresh);
    return () => window.removeEventListener('global-unread:refresh', handleRefresh);
  }, []);

  return counts;
};

// Format badge number: show 99+ for large counts
export const formatBadgeCount = (count: number): string => {
  if (count > 99) return '99+';
  return count.toString();
};
