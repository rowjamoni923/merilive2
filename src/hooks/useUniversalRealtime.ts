import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
const INSTANT_TABLES = new Set(['notifications', 'admin_notices', 'messages', 'group_messages', 'private_calls', 'seat_requests']);
const HIGH_FREQ_DEBOUNCE_MS = 120;
const HIGH_FREQUENCY_TABLES = new Set<string>();

// ⚡ COST-OPTIMISED: Only tables in the Supabase Realtime publication may bind.
// Room media/chat/gift fanout is LiveKit/FCM; live_streams stays realtime for list/end state.
// Each postgres_changes subscription generates realtime messages that cost $2.50/million.
const BASE_MONITORED_TABLES: TableSubscription[] = [];

const REALTIME_PUBLICATION_TABLES = new Set<string>([
  // ===== Core realtime (chat / call / payments) =====
  'notifications',
  'admin_notices',
  'admin_broadcast',
  'messages',
  'group_messages',
  'conversations',
  'private_calls',
  'seat_requests',
  'user_active_sessions',
  'profiles',
  'followers',
  'diamond_transactions',
  'payment_transactions',
  'game_transactions',
  'recharge_transactions',
  'helper_notifications',
  'helper_orders',
  // High-frequency room/live/gift/game fanout is intentionally NOT subscribed
  // here. Those paths use LiveKit/FCM + screen-scoped snapshots; subscribing
  // app-wide makes every client process other rooms' traffic and causes lag.

  // ===== Admin-managed visual assets (instant push on admin change) =====
  'gifts',
  'gift_categories',
  'banners',
  'popup_event_banners',
  'rating_banners',
  'pk_reward_banners',
  'entry_banners',
  'entry_effects',
  'entry_name_bars',
  'vehicle_entrances',
  'chat_bubbles',
  'avatar_frames',
  'role_frames',
  'beauty_filters',
  'ar_stickers',
  'party_room_backgrounds',
  'party_room_banners',
  'onboarding_slides',
  'app_event_themes',
  'app_icon_registry',
  'room_welcome_messages',

  // ===== Admin-managed pricing & economy =====
  'diamond_packages',
  'recharge_campaigns',
  'first_recharge_bonus',
  'limited_time_offers',
  'topup_payment_methods',
  'payment_gateways',
  'payment_methods',
  'helper_diamond_packages',
  'diamond_exchange_packages',
  'currency_rates',
  'consumption_return_config',
  'profit_config',
  'shop_items',
  'subscription_plans',
  'noble_cards',
  'parcel_templates',

  // ===== Admin-managed VIP & levels =====
  'vip_tiers',
  'vip_medals',
  'vip_perks',
  'vip_exclusive_items',
  'feature_level_requirements',
  'host_levels',
  'helper_level_config',
  'topup_helper_levels',
  'level_privileges',
  'level_privilege_tiers',
  'user_level_tiers',
  'user_level_thresholds',
  'trader_level_tiers',
  'agency_level_tiers',

  // ===== Admin-managed config & rules =====
  'app_settings',
  'app_version_settings',
  'app_content',
  'site_content',
  'site_settings',
  'branding_settings',
  'daily_login_rewards_config',
  'daily_tasks',
  'ranking_rewards',
  'leaderboard_reward_config',
  'leaderboard_podium_frames',
  'invitation_settings',
  'invitation_reward_tiers',
  'live_categories',
  'live_moderation_settings',
  'notification_templates',
  'allowed_external_links',
  'categories',
  'channels',

  // ===== Admin-managed games & PK =====
  'game_settings',
  'game_configs',
  'game_providers',
  'game_server_settings',
  'provider_games',
  'pk_battle_assets',
  'pk_competitions',
  'pk_competition_rewards',
  'lucky_gift_config',
  'new_host_live_bonus_settings',

  // ===== Admin-managed content =====
  'landing_page_sections',
  'help_articles',
  'support_categories',
  'iptv_sources',
  'news_sources',
  'youtube_sources',
  'movies',
  'music',
  'admin_music_library',
  'poster_images',
  'reel_categories',
  'agency_faqs',
  'agency_policy_settings',
  'agency_performance',
  'agency_rankings',
  'agency_earnings_transfers',
  'agency_commission_history',
  'gift_combo_window',
  'violation_penalty_tiers',
]);

// Must mirror the actual app-facing supabase_realtime publication guarded in
// realtimeGuard.ts. The larger catalog above is kept as documentation of tables
// that may be syncable through admin_broadcast/REST, but direct postgres_changes
// binds to unpublished catalog tables (vip_tiers, shop_items, avatar_frames, etc.)
// create blocked joins + console/network churn on every route.
const APP_REALTIME_PUBLICATION_TABLES = new Set<string>([
  'notifications',
  'admin_broadcast',
  'user_active_sessions',
  'profiles',
  'followers',
  'gift_transactions',
  'live_streams',
  'private_calls',
  'agencies',
  'topup_helpers',
  'face_verification_submissions',
  'admin_notices',
  'agency_withdrawals',
  'conversations',
  'group_messages',
  'host_applications',
  'stream_viewers',
  'party_rooms',
  'party_room_participants',
  'party_room_messages',
  'seat_requests',
  'messages',
  'app_settings',
  'agency_performance',
  'agency_hosts',
  'agency_diamond_transactions',
  'agency_earnings_transfers',
  'agency_commission_history',
  'diamond_transactions',
  'daily_login_claims',
  'helper_notifications',
  'helper_orders',
  'helper_topup_requests',
  'helper_upgrade_requests',
  'helper_withdrawal_requests',
  'live_bans',
  'live_frame_alerts',
  'live_game_bets',
  'live_game_rounds',
  'payroll_requests',
  'rating_reward_claims',
  'recharge_transactions',
  'reel_comments',
  'reel_likes',
  'reel_shares',
  'reels',
  'stream_chat',
  'user_task_progress',
  'user_vip_subscriptions',
  'user_parcels',
  'payment_transactions',
  'game_transactions',
  'level_animations',
  'level_privileges',
  'user_level_tiers',
  'trader_level_tiers',
  'helper_country_payment_methods',
  'pk_battles',
  'pk_battle_gifts',
  'pk_participants',
  'groups',
  'group_members',
]);


const getActiveMonitoredTables = (): TableSubscription[] => {
  const tables = new Set<string>(BASE_MONITORED_TABLES.map((t) => t.table));

  subscribers.forEach((subscriber) => {
    subscriber.tables.forEach((table) => {
      if (!table || table === '*') return;
      if (!REALTIME_PUBLICATION_TABLES.has(table) || !APP_REALTIME_PUBLICATION_TABLES.has(table)) return;
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
    // Pkg362: Avoid loop — do not re-notify if this event was dispatched by us below.
    if (detail.source === 'universal-realtime') return;
    // Admin broadcast changes are handled by the dedicated admin-table-update
    // listener. Replaying them here doubles cache invalidations and can cause
    // visible app-wide refresh storms after admin saves.
    if (detail.source === 'admin-broadcast') return;

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

          // 🚀 Bridge Real-time DB changes to legacy useAppSyncEvent listeners.
          // This ensures that any direct DB update (e.g. from admin panel)
          // instantly triggers UI refreshes in components watching via useAppSyncEvent.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('app-sync', {
              detail: { topic: table, eventType, payload: data, source: 'universal-realtime' }
            }));
          }

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
  }, 200); // Reduced from 500ms to 200ms for faster subscription changes

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
  const tableKey = useMemo(() => [...tables].sort().join(','), [tables]);
  const subscriberIdRef = useRef(`hook-${Math.random().toString(36).slice(2, 11)}`);

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const subscriberId = subscriberIdRef.current;

    const unsubscribe = subscribeToTables(
      subscriberId,
      tables,
      (table, event, payload) => callbackRef.current(table, event, payload)
    );

    return unsubscribe;
  }, [enabled, tableKey]);

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
  onBalanceUpdate?: (diamonds: number) => void,
  onNotification?: (notification: any) => void
) => {
  useEffect(() => {
    if (!userId) return;

    const subscriberId = `user-${userId}`;

    const unsubscribe = subscribeToTables(
      subscriberId,
      ['profiles', 'notifications'],
      (table, event, payload) => {
        // Profile updates
        if (table === 'profiles' && payload?.id === userId) {
          if (onProfileUpdate) onProfileUpdate(payload);
          if (onBalanceUpdate && payload?.diamonds !== undefined) {
            onBalanceUpdate(payload.diamonds);
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
  // Prefer direct subscribeToTables('live_streams') at call sites that need list/end-state sync.
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
