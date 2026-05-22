import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * 🚀 Universal Real-time Subscription System
 * 
 * High-quality, enterprise-grade real-time sync for all tables
 * Features:
 * - Single optimized channel for all subscriptions
 * - Automatic reconnection with exponential backoff
 * - Smart batching to prevent UI thrashing
 * - Memory-efficient pub-sub pattern
 * - Type-safe event handling
 */

// ============= Types =============
type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface TableSubscription {
  table: string;
  schema?: string;
  event?: EventType;
  filter?: string;
}

interface SubscriberCallback {
  id: string;
  tables: string[];
  callback: (table: string, event: EventType, payload: any) => void;
}

// ============= Global State =============
let universalChannel: RealtimeChannel | null = null;
let isConnected = false;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const FORCE_RECONNECT_COOLDOWN_MS = 15_000;
const subscribers = new Map<string, SubscriberCallback>();
const activeTableSet = new Set<string>();
const tableDataCache = new Map<string, any[]>();
const pendingUpdates = new Map<string, NodeJS.Timeout>();
let lastForcedReconnectAt = 0;
let channelRebuildTimer: NodeJS.Timeout | null = null;
let authStateUnsubscribe: (() => void) | null = null;
let externalSyncBridgeAttached = false;

// Debounce time for batch updates (ms)
const DEBOUNCE_MS = 80;

// Notifications: ZERO debounce for instant delivery.
// Room/call/live/gift/chat fanout is LiveKit/FCM + REST snapshots only.
// Other high-frequency tables get a slight debounce to prevent render thrash
const INSTANT_TABLES = new Set(['notifications']);
const HIGH_FREQ_DEBOUNCE_MS = 120;
const HIGH_FREQUENCY_TABLES = new Set<string>();

// ⚡ COST-OPTIMISED: Only tables in the Supabase Realtime publication may bind.
// Room/call/live/party/PK/gift/chat fanout is LiveKit/FCM + REST snapshots only.
// Each postgres_changes subscription generates realtime messages that cost $2.50/million.
const BASE_MONITORED_TABLES: TableSubscription[] = [];

const REALTIME_PUBLICATION_TABLES = new Set<string>();

const getActiveMonitoredTables = (): TableSubscription[] => {
  const tables = new Set<string>(BASE_MONITORED_TABLES.map((t) => t.table));

  subscribers.forEach((subscriber) => {
    subscriber.tables.forEach((table) => {
      if (!table || table === '*') return;
      if (!REALTIME_PUBLICATION_TABLES.has(table)) return;
      tables.add(table);
    });
  });

  return Array.from(tables).map((table) => ({ table }));
};

// ============= Event Batching =============
const notifySubscribers = (table: string, event: EventType, payload: any) => {
  const fireCallbacks = () => {
    subscribers.forEach((subscriber) => {
      if (subscriber.tables.includes(table) || subscriber.tables.includes('*')) {
        try {
          subscriber.callback(table, event, payload);
        } catch (error) {
          console.error(`[UniversalRealtime] Error in subscriber ${subscriber.id}:`, error);
        }
      }
    });
  };

  // INSTANT delivery for messages, gifts, notifications — zero delay
  if (INSTANT_TABLES.has(table)) {
    fireCallbacks();
    return;
  }

  // Clear any pending update for this table
  const existingTimeout = pendingUpdates.get(table);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Batch updates with debounce for other tables
  const delay = HIGH_FREQUENCY_TABLES.has(table) ? HIGH_FREQ_DEBOUNCE_MS : DEBOUNCE_MS;
  const timeout = setTimeout(() => {
    fireCallbacks();
    pendingUpdates.delete(table);
  }, delay);

  pendingUpdates.set(table, timeout);
};

const normalizeEventType = (value: unknown): EventType => {
  const type = String(value || 'UPDATE').toUpperCase();
  return type === 'INSERT' || type === 'UPDATE' || type === 'DELETE' ? type : '*';
};

const ensureExternalSyncBridge = () => {
  if (externalSyncBridgeAttached || typeof window === 'undefined') return;
  externalSyncBridgeAttached = true;

  window.addEventListener('admin-table-update', (event: Event) => {
    const detail = (event as CustomEvent<any>).detail || {};
    const table = typeof detail.table === 'string' ? detail.table : null;
    if (!table) return;
    notifySubscribers(table, normalizeEventType(detail.eventType), detail.payload || detail);
  });

  window.addEventListener('app-sync', (event: Event) => {
    const detail = (event as CustomEvent<any>).detail || {};
    const table = typeof detail.topic === 'string' ? detail.topic : null;
    if (!table) return;
    notifySubscribers(table, normalizeEventType(detail.eventType), detail.payload || detail);
  });

  window.addEventListener('own-beans-updated', (event: Event) => {
    const detail = (event as CustomEvent<any>).detail || {};
    notifySubscribers('profiles', 'UPDATE', detail);
  });

  window.addEventListener('notifications:change', (event: Event) => {
    const detail = (event as CustomEvent<any>).detail || {};
    notifySubscribers('notifications', normalizeEventType(detail.eventType), detail.notification || detail.payload || detail);
  });
};

// ============= Channel Management =============
let reconnectTimer: NodeJS.Timeout | null = null;
let isInitializing = false;

const hasActiveSubscribers = () => subscribers.size > 0;

const ensureAuthStateListener = () => {
  if (authStateUnsubscribe) return;

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
      if (hasActiveSubscribers() && !universalChannel && !isInitializing) {
        setTimeout(() => void initializeUniversalChannel(), 0);
      }
      return;
    }

    if (event === 'SIGNED_OUT') {
      isConnected = false;
      isInitializing = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (channelRebuildTimer) {
        clearTimeout(channelRebuildTimer);
        channelRebuildTimer = null;
      }
      universalChannel = null;
      void cleanupUniversalChannels();
    }
  });

  authStateUnsubscribe = () => data.subscription.unsubscribe();
};

const cleanupUniversalChannels = async () => {
  const existingChannels = supabase
    .getChannels()
    .filter((channel) => {
      const topic = (channel as any)?.topic ?? '';
      return typeof topic === 'string' && topic.includes('universal-realtime-v3');
    });

  if (existingChannels.length === 0) return;

  await Promise.all(
    existingChannels.map(async (channel) => {
      try {
        await supabase.removeChannel(channel);
      } catch (e) {
        console.log('[UniversalRealtime] Channel cleanup error (ignored):', e);
      }
    })
  );
};

const initializeUniversalChannel = async () => {
  if (universalChannel || isInitializing || !hasActiveSubscribers()) return;

  // Pkg94 audit: this bridge must NOT open its own postgres_changes channel.
  // `useNotifications` owns the only user-facing notifications subscription
  // with a strict `user_id=eq.<currentUser>` filter. Admin/app sync reaches
  // this bridge through window events (`admin-table-update`, `app-sync`,
  // `own-beans-updated`) registered in ensureExternalSyncBridge().
  const monitoredTables = getActiveMonitoredTables();
  if (monitoredTables.length === 0) {
    isConnected = false;
    return;
  }

  isInitializing = true;

  console.log('[UniversalRealtime] 🚀 Initializing...');

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      console.log('[UniversalRealtime] ⏸️ No active session, skipping realtime init');
      isInitializing = false;
      isConnected = false;
      return;
    }

    let channel = supabase.channel(`universal-realtime-v3-${session.user.id}`, {
      config: {
        broadcast: { self: false },
        presence: { key: `universal-${session.user.id}` }
      }
    });

    // Subscribe only to explicitly publication-approved tables (dynamic).
    activeTableSet.clear();
    monitoredTables.forEach(({ table }) => activeTableSet.add(table));

    monitoredTables.forEach(({ table, schema = 'public', event = '*', filter }) => {
      const config: any = { event, schema, table };
      if (filter) config.filter = filter;

      channel = channel.on(
        'postgres_changes',
        config,
        (payload: RealtimePostgresChangesPayload<any>) => {
          const eventType = payload.eventType as EventType;
          const data = eventType === 'DELETE' ? payload.old : payload.new;
          notifySubscribers(table, eventType, data);
        }
      );
    });

    // Handle connection status
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        isConnected = true;
        isInitializing = false;
        connectionAttempts = 0;
        console.log('[UniversalRealtime] ✅ Connected successfully!');

        // Clear any pending reconnect
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        isConnected = false;
        isInitializing = false;

        // Only reconnect if not already pending and subscribers still exist
        if (!reconnectTimer && hasActiveSubscribers()) {
          handleReconnect();
        }
      } else if (status === 'TIMED_OUT') {
        console.log('[UniversalRealtime] ⏱️ Connection timed out, will retry...');
        isConnected = false;
        isInitializing = false;
        handleReconnect();
      }
    });

    universalChannel = channel;
  } catch (error) {
    console.error('[UniversalRealtime] Init failed:', error);
    isInitializing = false;
    isConnected = false;
    handleReconnect();
  }
};

// ============= Reconnection Logic =============
const handleReconnect = () => {
  if (!hasActiveSubscribers()) return;

  if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[UniversalRealtime] ⚠️ Max attempts reached, fast reset in 5s');
    // Fast reset to keep realtime snappy (no long freeze windows)
    reconnectTimer = setTimeout(() => {
      connectionAttempts = 0;
      reconnectTimer = null;
      void cleanupAndReconnect();
    }, 5000);
    return;
  }

  connectionAttempts++;
  // Fast reconnect: 1s, 2s, 4s, 8s, max 15s — instant recovery
  const delay = Math.min(1000 * Math.pow(2, connectionAttempts - 1), 15000);

  console.log(`[UniversalRealtime] ⚡ Recovering in ${delay}ms (attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void cleanupAndReconnect();
  }, delay);
};

const cleanupAndReconnect = async () => {
  if (!hasActiveSubscribers()) {
    isConnected = false;
    isInitializing = false;
    return;
  }

  isConnected = false;
  isInitializing = false;
  await cleanupUniversalChannels();
  universalChannel = null;
  activeTableSet.clear();
  await initializeUniversalChannel();
};

// ============= Public API =============

// ⚡ COST-OPTIMISED: Debounce channel rebuild to reduce churn.
// But keep it fast enough for instant chat/gift delivery.
const scheduleChannelRebuild = () => {
  if (!universalChannel || !hasActiveSubscribers()) return;
  const nextTables = new Set(getActiveMonitoredTables().map((item) => item.table));
  const unchanged = nextTables.size === activeTableSet.size &&
    Array.from(nextTables).every((table) => activeTableSet.has(table));
  if (unchanged) return;

  if (channelRebuildTimer) clearTimeout(channelRebuildTimer);

  channelRebuildTimer = setTimeout(() => {
    channelRebuildTimer = null;
    void cleanupAndReconnect();
  }, 500);
};

/**
 * Subscribe to real-time updates for specific tables
 */
export const subscribeToTables = (
  subscriberId: string,
  tables: string[],
  callback: (table: string, event: EventType, payload: any) => void
): (() => void) => {
  ensureAuthStateListener();
  ensureExternalSyncBridge();

  const previousTables = getActiveMonitoredTables().map((item) => item.table).sort().join('|');

  subscribers.set(subscriberId, {
    id: subscriberId,
    tables,
    callback
  });

  const nextTables = getActiveMonitoredTables().map((item) => item.table).sort().join('|');

  // Rebuild channel bindings only when the actual table-set changes.
  if (previousTables !== nextTables) scheduleChannelRebuild();

  // Ensure channel is initialized
  void initializeUniversalChannel();

  return () => {
    const tablesBeforeDelete = getActiveMonitoredTables().map((item) => item.table).sort().join('|');
    subscribers.delete(subscriberId);
    const remainingTables = getActiveMonitoredTables().map((item) => item.table).sort().join('|');

    if (subscribers.size === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (channelRebuildTimer) {
        clearTimeout(channelRebuildTimer);
        channelRebuildTimer = null;
      }
      connectionAttempts = 0;
      isConnected = false;
      universalChannel = null;
      activeTableSet.clear();
      authStateUnsubscribe?.();
      authStateUnsubscribe = null;
      void cleanupUniversalChannels();
      return;
    }

    // Remaining subscribers changed target tables => rebuild subscriptions
    if (tablesBeforeDelete !== remainingTables) scheduleChannelRebuild();
  };
};

/**
 * Get current connection status
 */
export const getConnectionStatus = () => ({
  isConnected,
  subscriberCount: subscribers.size,
  monitoredTables: getActiveMonitoredTables().length
});

/**
 * Force reconnect the universal realtime channel
 * Used when app resumes from background or network changes
 */
export const forceReconnectChannel = () => {
  if (!hasActiveSubscribers()) return;

  const now = Date.now();
  if (now - lastForcedReconnectAt < FORCE_RECONNECT_COOLDOWN_MS) {
    console.log('[UniversalRealtime] ⏭️ Force reconnect skipped (cooldown)');
    return;
  }

  lastForcedReconnectAt = now;
  console.log('[UniversalRealtime] 🔄 Force reconnect triggered');
  connectionAttempts = 0; // Reset attempts
  void cleanupAndReconnect();
};

// ============= React Hooks =============

/**
 * Hook for subscribing to multiple tables with automatic cleanup
 */
export const useUniversalRealtime = (
  tables: string[],
  onUpdate: (table: string, event: EventType, payload: any) => void,
  enabled: boolean = true
) => {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const subscriberId = `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const unsubscribe = subscribeToTables(
      subscriberId,
      tables,
      (table, event, payload) => callbackRef.current(table, event, payload)
    );

    return unsubscribe;
  }, [enabled, JSON.stringify(tables)]);

  return { isConnected };
};

/**
 * Hook for auto-refreshing data when table changes
 */
export const useAutoRefresh = <T>(
  table: string,
  fetchData: () => Promise<T>,
  enabled: boolean = true
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchData();
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      refresh();
    }
  }, [enabled]);

  // Real-time updates
  useUniversalRealtime(
    [table],
    () => refresh(),
    enabled
  );

  return { data, loading, error, lastUpdated, refresh };
};

/**
 * Hook for user-specific real-time updates
 */
export const useUserRealtime = (
  userId: string | null,
  onProfileUpdate?: (profile: any) => void,
  onBalanceUpdate?: (coins: number) => void,
  onNotification?: (notification: any) => void
) => {
  useEffect(() => {
    if (!userId) return;

    const subscriberId = `user-${userId}`;

    const unsubscribe = subscribeToTables(
      subscriberId,
      ['notifications'],
      (table, event, payload) => {
        // Profile updates
        if (table === 'profiles' && payload?.id === userId) {
          if (onProfileUpdate) onProfileUpdate(payload);
          if (onBalanceUpdate && payload?.coins !== undefined) {
            onBalanceUpdate(payload.coins);
          }
        }

        // Notifications
        if (table === 'notifications' && payload?.user_id === userId && event === 'INSERT') {
          if (onNotification) onNotification(payload);
        }

      }
    );

    return unsubscribe;
  }, [userId]);
};

/**
 * Hook for agency real-time updates
 */
export const useAgencyRealtimeUniversal = (
  agencyId: string | null,
  onUpdate: () => void
) => {
  useEffect(() => {
    if (!agencyId) return;

    const handleAdminUpdate = (event: Event) => {
      const table = (event as CustomEvent).detail?.table;
      if (table === 'agencies' || table === 'agency_withdrawals') onUpdate();
    };

    window.addEventListener('admin-table-update', handleAdminUpdate);
    return () => window.removeEventListener('admin-table-update', handleAdminUpdate);
  }, [agencyId, onUpdate]);
};

/**
 * Hook for live stream real-time updates
 */
export const useLiveStreamRealtime = (
  streamId: string | null,
  onUpdate: (stream: any) => void
) => {
  useEffect(() => {
    // Live stream realtime state is LiveKit/FCM + REST snapshots only.
    return;
  }, [streamId, onUpdate]);
};

/**
 * Hook for party room real-time updates
 */
export const usePartyRoomRealtime = (
  roomId: string | null,
  onUpdate: () => void
) => {
  useEffect(() => {
    // Party room realtime state is LiveKit/FCM + REST snapshots only.
    return;
  }, [roomId, onUpdate]);
};

// ============= Lazy Initialization =============
// Channel is initialized on first subscriber, NOT on import
// This prevents heavy WebSocket connections on unauthenticated pages

export default {
  useUniversalRealtime,
  useAutoRefresh,
  useUserRealtime,
  useAgencyRealtimeUniversal,
  useLiveStreamRealtime,
  usePartyRoomRealtime,
  subscribeToTables,
  getConnectionStatus,
  forceReconnectChannel
};
