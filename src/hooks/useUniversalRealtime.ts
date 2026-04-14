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
const tableDataCache = new Map<string, any[]>();
const pendingUpdates = new Map<string, NodeJS.Timeout>();
let lastForcedReconnectAt = 0;
let channelRebuildTimer: NodeJS.Timeout | null = null;

// Debounce time for batch updates (ms) - tuned for ultra-fast but stable UX
const DEBOUNCE_MS = 120;

// High-frequency tables get a slightly higher debounce to prevent render thrash
const HIGH_FREQ_DEBOUNCE_MS = 180;
const HIGH_FREQUENCY_TABLES = new Set(['messages']);

// ⚡ COST-OPTIMISED: Only tables that MUST be monitored globally
// All other tables subscribe on-demand via subscribeToTables()
// Each postgres_changes subscription generates realtime messages that cost $2.50/million
const BASE_MONITORED_TABLES: TableSubscription[] = [
  // Only truly global needs — chat & notifications
  { table: 'messages' },
  { table: 'notifications' },
];

const getActiveMonitoredTables = (): TableSubscription[] => {
  const tables = new Set<string>(BASE_MONITORED_TABLES.map((t) => t.table));

  subscribers.forEach((subscriber) => {
    subscriber.tables.forEach((table) => {
      if (!table || table === '*') return;
      tables.add(table);
    });
  });

  return Array.from(tables).map((table) => ({ table }));
};

// ============= Event Batching =============
const notifySubscribers = (table: string, event: EventType, payload: any) => {
  // Clear any pending update for this table
  const existingTimeout = pendingUpdates.get(table);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Batch updates with debounce — high-frequency tables get longer delay
  const delay = HIGH_FREQUENCY_TABLES.has(table) ? HIGH_FREQ_DEBOUNCE_MS : DEBOUNCE_MS;
  const timeout = setTimeout(() => {
    subscribers.forEach((subscriber) => {
      if (subscriber.tables.includes(table) || subscriber.tables.includes('*')) {
        try {
          subscriber.callback(table, event, payload);
        } catch (error) {
          console.error(`[UniversalRealtime] Error in subscriber ${subscriber.id}:`, error);
        }
      }
    });
    pendingUpdates.delete(table);
  }, delay);

  pendingUpdates.set(table, timeout);
};

// ============= Channel Management =============
let reconnectTimer: NodeJS.Timeout | null = null;
let isInitializing = false;

const hasActiveSubscribers = () => subscribers.size > 0;

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

    let channel = supabase.channel('universal-realtime-v3', {
      config: {
        broadcast: { self: false },
        presence: { key: 'universal' }
      }
    });

    // Subscribe to all currently requested tables (dynamic)
    getActiveMonitoredTables().forEach(({ table, schema = 'public', event = '*', filter }) => {
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
  await initializeUniversalChannel();
};

// ============= Public API =============

// ⚡ COST-OPTIMISED: Debounce channel rebuild to reduce churn.
// But keep it fast enough for instant chat/gift delivery.
const scheduleChannelRebuild = () => {
  if (!universalChannel || !hasActiveSubscribers()) return;
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
  subscribers.set(subscriberId, {
    id: subscriberId,
    tables,
    callback
  });

  // Rebuild channel bindings when subscriber table-set changes
  scheduleChannelRebuild();

  // Ensure channel is initialized
  void initializeUniversalChannel();

  return () => {
    subscribers.delete(subscriberId);

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
      void cleanupUniversalChannels();
      return;
    }

    // Remaining subscribers changed target tables => rebuild subscriptions
    scheduleChannelRebuild();
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
      ['profiles', 'notifications', 'gift_transactions'], // coin_transfers NOT in publication
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

        // Gift received - refetch balance
        if (table === 'gift_transactions' && payload?.receiver_id === userId) {
          // Trigger balance refetch
          supabase
            .from('profiles')
            .select('coins')
            .eq('id', userId)
            .single()
            .then(({ data }) => {
              if (data && onBalanceUpdate) {
                onBalanceUpdate(data.coins || 0);
              }
            });
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

    const subscriberId = `agency-${agencyId}`;

    const unsubscribe = subscribeToTables(
      subscriberId,
      ['agencies', 'agency_withdrawals'], // agency_hosts & agency_earnings_transfers NOT in publication
      (table, event, payload) => {
        // Check if update is for this agency
        const isRelevant = 
          (table === 'agencies' && payload?.id === agencyId) ||
          (table !== 'agencies' && payload?.agency_id === agencyId);

        if (isRelevant) {
          console.log(`[AgencyRealtime] ${table} updated for agency ${agencyId}`);
          onUpdate();
        }
      }
    );

    return unsubscribe;
  }, [agencyId]);
};

/**
 * Hook for live stream real-time updates
 */
export const useLiveStreamRealtime = (
  streamId: string | null,
  onUpdate: (stream: any) => void
) => {
  useEffect(() => {
    if (!streamId) return;

    const subscriberId = `stream-${streamId}`;

    const unsubscribe = subscribeToTables(
      subscriberId,
      ['live_streams', 'gift_transactions'],
      (table, event, payload) => {
        if (table === 'live_streams' && payload?.id === streamId) {
          onUpdate(payload);
        }
      }
    );

    return unsubscribe;
  }, [streamId]);
};

/**
 * Hook for party room real-time updates
 */
export const usePartyRoomRealtime = (
  roomId: string | null,
  onUpdate: () => void
) => {
  useEffect(() => {
    if (!roomId) return;

    const subscriberId = `party-${roomId}`;

    const unsubscribe = subscribeToTables(
      subscriberId,
      ['party_rooms', 'party_room_participants', 'gift_transactions'],
      (table, event, payload) => {
        const isRelevant = 
          (table === 'party_rooms' && payload?.id === roomId) ||
          (table === 'party_room_participants' && payload?.room_id === roomId) ||
          (table === 'gift_transactions' && payload?.room_id === roomId);

        if (isRelevant) {
          onUpdate();
        }
      }
    );

    return unsubscribe;
  }, [roomId]);
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
