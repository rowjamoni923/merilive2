import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { getAdminRealtimeLockRemaining } from "@/utils/adminRealtimeMutationGuard";

/**
 * 🔄 Unified Admin Realtime System (Single Source of Truth)
 * 
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────┐
 * │  AdminLayout (ONE global subscription)          │
 * │  └── 2 chunked channels → postgres_changes      │
 * │      └── dispatchAdminTableUpdate() → window     │
 * ├─────────────────────────────────────────────────┤
 * │  Every admin page:                              │
 * │  useAdminRealtime(['table1','table2'], refresh) │
 * │  └── Listens to window events ONLY              │
 * │      └── Zero extra DB channels!                │
 * └─────────────────────────────────────────────────┘
 * 
 * Non-admin pages: Creates direct postgres_changes channels
 * only for tables NOT in global monitoring.
 */

// ============= GLOBAL EVENT DISPATCHER =============

export const ADMIN_REALTIME_EVENT = 'admin-table-update';

export interface AdminTableUpdateEvent {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  payload?: any;
}

export function dispatchAdminTableUpdate(detail: AdminTableUpdateEvent) {
  window.dispatchEvent(new CustomEvent(ADMIN_REALTIME_EVENT, { detail }));
}

// ============= ALL MONITORED TABLES =============
// AdminLayout subscribes to these via chunked channels.
// Admin pages consume them via events — zero extra channels.

// ⚡ Global admin subscription coverage.
// Any table listed here is watched once by AdminLayout and fan-outs updates to pages
// via window events, letting most admin pages refresh without opening extra channels.
export const GLOBALLY_MONITORED_TABLES = new Set<string>([
  // Pending action tables (drive badge counts + toast alerts)
  'helper_upgrade_requests',
  'helper_topup_requests',
  'helper_applications',
  'helper_message_replies',
  'helper_admin_messages',
  'helper_withdrawal_requests',
  'helper_orders',
  'support_tickets',
  'support_messages',
  'agency_withdrawals',
  'agencies',
  'host_conversion_requests',
  'host_applications',
  'payroll_requests',
  'user_reports',
  'face_verification_submissions',
  'chat_moderation_logs',
  'live_bans',
  'live_face_violations',
  'notifications',
  'admin_notices',
  'admin_notifications',

  // Core shared lookup/data tables used across many admin pages
  'profiles',
  'topup_helpers',
  'agency_hosts',
  'app_settings',
  'admin_logs',
  'admin_users',
  'admin_allowed_devices',
  'admin_sections',
  'admin_section_permissions',
  'banners',
  'animations',
  'assets',

  // Financial / operational tables
  'recharge_transactions',
  'coin_transfers',
  'agency_earnings_transfers',
  'rating_reward_claims',
  'leaderboard_reward_history',
  'consumption_return_history',
  'helper_transactions',
  'payment_transactions',
  'private_calls',
  'stream_viewers',

  // Activity / moderation
  'live_streams',
  'host_contact_violations',
  'banned_devices',

  // Settings / content tables (admin-managed)
  'game_providers',
  'game_server_settings',
  'vip_tiers',
  'branding_settings',
  'app_version_settings',
  'recharge_campaigns',
  'invitation_settings',
  'invitation_reward_tiers',
  'coin_packages',
  'level_privileges',
  'level_animations',
  'user_level_tiers',
  'leaderboard_reward_config',
  'party_rooms',
  'party_room_banners',
  'party_room_backgrounds',
  'popup_event_banners',
  'reels',
  'reel_categories',
  'reel_reports',
  'avatar_frames',
  'role_frames',
  'user_role_frames',
  'gifts',
  'sounds',
  'helper_diamond_packages',
  'helper_level_config',
  'helper_notifications',
  'helper_country_payment_methods',
  'trader_level_tiers',
  'landing_page_sections',
  'device_tokens',
]);

// ============= HOOK =============

const DEFAULT_DEBOUNCE_MS = 120;
const DEFAULT_STALE_REFRESH_MS = 45_000;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;

interface UseAdminRealtimeOptions {
  debounceMs?: number;
  /**
   * Disabled by default to keep admin pages strictly realtime-driven
   * (no timer-based refresh when tab becomes visible).
   */
  enableVisibilityRefresh?: boolean;
  /**
   * Disabled by default to avoid auto-refresh loops.
   * Enable only for specific legacy pages if needed.
   */
  enableStaleFallback?: boolean;
  staleRefreshMs?: number;
  healthCheckIntervalMs?: number;
}

export const useAdminRealtime = (
  tables: string[],
  onUpdate: (() => void) | (() => Promise<void>),
  channelName?: string,
  options: UseAdminRealtimeOptions = {}
) => {
  const onUpdateRef = useRef(onUpdate);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const trackedTables = useMemo(() => Array.from(new Set(tables)), [tables.join('|')]);

  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const enableVisibilityRefresh = options.enableVisibilityRefresh ?? false;
  const enableStaleFallback = options.enableStaleFallback ?? false;
  const staleRefreshMs = options.staleRefreshMs ?? DEFAULT_STALE_REFRESH_MS;
  const healthCheckIntervalMs = options.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS;

  const isAdminRoute = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.pathname.startsWith('/admin') ||
      window.location.hash.startsWith('#/admin') ||
      window.location.hash.includes('/admin')
    );
  }, []);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const runRefresh = () => {
      const lockRemaining = getAdminRealtimeLockRemaining(trackedTables);

      if (lockRemaining > 0) {
        debounceRef.current = setTimeout(runRefresh, Math.min(lockRemaining + 60, 2000));
        return;
      }

      onUpdateRef.current();
    };

    debounceRef.current = setTimeout(runRefresh, debounceMs);
  }, [debounceMs, trackedTables]);

  // ⚡ Auth-aware: Only fetch data AFTER auth session is confirmed
  // This prevents "Failed to load data" toasts from premature RLS-blocked queries
  const authReadyRef = useRef(false);

  useEffect(() => {
    let authRefreshTimer: NodeJS.Timeout | null = null;
    let cancelled = false;

    const doInitialFetch = () => {
      if (cancelled) return;
      authReadyRef.current = true;
      if (authRefreshTimer) clearTimeout(authRefreshTimer);
      authRefreshTimer = setTimeout(() => {
        if (!cancelled) onUpdateRef.current();
      }, 80);
    };

    let subscription: { unsubscribe: () => void } | null = null;

    if (isAdminRoute()) {
      if (getAdminSession()) doInitialFetch();
      const adminSessionHandler = () => {
        if (getAdminSession()) doInitialFetch();
      };
      window.addEventListener('storage', adminSessionHandler);
      window.addEventListener('admin-session-change', adminSessionHandler);
      subscription = {
        unsubscribe: () => {
          window.removeEventListener('storage', adminSessionHandler);
          window.removeEventListener('admin-session-change', adminSessionHandler);
        },
      };
    } else {
      // Non-admin fallback for any legacy usage outside /admin.
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) doInitialFetch();
      });

      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          doInitialFetch();
        }
      });
      subscription = data.subscription;
    }

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      if (authRefreshTimer) clearTimeout(authRefreshTimer);
    };
  }, [isAdminRoute]);

  useEffect(() => {
    const isOnAdminRoute = isAdminRoute();

    const eventTables = trackedTables.filter((t) => GLOBALLY_MONITORED_TABLES.has(t));
    const directTables = trackedTables.filter((t) => !GLOBALLY_MONITORED_TABLES.has(t));

    let lastRealtimeTouch = Date.now();

    // NO blind initial fetch — auth-aware effect above handles the first load
    const initialRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    const handleGlobalEvent = (e: Event) => {
      const detail = (e as CustomEvent<AdminTableUpdateEvent>).detail;
      if (detail?.table === '*' || eventTables.includes(detail?.table)) {
        lastRealtimeTouch = Date.now();
        debouncedRefresh();
      }
    };

    if (eventTables.length > 0) {
      window.addEventListener(ADMIN_REALTIME_EVENT, handleGlobalEvent);
    }

    // Direct channel for tables outside global monitoring (admin + non-admin routes)
    let channel: ReturnType<typeof supabase.channel> | ReturnType<typeof adminSupabase.channel> | null = null;
    if (directTables.length > 0) {
      const realtimeClient = isOnAdminRoute ? adminSupabase : supabase;
      const name = channelName || `rt-${directTables.join('-')}-${crypto.randomUUID()}`;
      channel = realtimeClient.channel(name);
      for (const table of directTables) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => {
            lastRealtimeTouch = Date.now();
            debouncedRefresh();
          }
        );
      }
      channel.subscribe();
    }

    // Optional stale fallback for exceptional cases only (disabled by default)
    const healthInterval =
        isOnAdminRoute && enableStaleFallback
        ? window.setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - lastRealtimeTouch > staleRefreshMs) {
              onUpdateRef.current();
            }
          }, healthCheckIntervalMs)
        : 0;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') debouncedRefresh();
    };

    if (enableVisibilityRefresh) {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      clearTimeout(initialRefreshTimer);
      if (eventTables.length > 0) {
        window.removeEventListener(ADMIN_REALTIME_EVENT, handleGlobalEvent);
      }
      if (channel) (isOnAdminRoute ? adminSupabase : supabase).removeChannel(channel as any);
      if (healthInterval) clearInterval(healthInterval);
      if (enableVisibilityRefresh) {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
      trackedTables.join('|'),
    debouncedRefresh,
    channelName,
    enableVisibilityRefresh,
    enableStaleFallback,
    staleRefreshMs,
    healthCheckIntervalMs,
    isAdminRoute,
  ]);
};

export default useAdminRealtime;
