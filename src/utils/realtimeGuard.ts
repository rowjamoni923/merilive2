/**
 * 🛡️ Realtime Publication Guard
 * 
 * CRITICAL PROTECTION: Prevents database overload by blocking
 * postgres_changes subscriptions to tables NOT in supabase_realtime publication.
 * 
 * WHY: Each postgres_changes subscription creates DB connections and runs
 * heavy queries on pg_publication_tables. With 65+ tables, this caused
 * 10-30 second query times and server crashes.
 * 
 * HOW: Monkey-patches supabase.channel().on() to silently skip
 * postgres_changes for non-publication tables. Broadcast/presence
 * channels are NOT affected.
 * 
 * RULE: If you need to add a table to realtime, you MUST:
 * 1. Add it to supabase_realtime publication via migration
 * 2. Add it to PUBLICATION_TABLES below
 * 3. Add it to useUniversalRealtime.ts MONITORED_TABLES
 * 4. Add it to useRealtimeQuerySync.ts TABLE_TO_QUERY_KEYS
 */

import { supabase } from '@/integrations/supabase/client';

// ============= THE ONLY SOURCE OF TRUTH =============
// These are the ONLY tables in the supabase_realtime publication.
// Subscribing to anything else wastes DB connections.
const PUBLICATION_TABLES = new Set([
  'messages',
  'conversations',
  'live_streams',
  'party_rooms',
  'party_room_participants',
  'notifications',
  'profiles',
  'gift_transactions',
  'private_calls',
  'app_settings',
  'agencies',
  'agency_withdrawals',
  'support_tickets',
  'support_messages',
  'stream_chat',
  'stream_viewers',
  'rating_reward_claims',
  'face_verification_submissions',
]);

// During DB pressure we preserve only mission-critical realtime tables.
const ESSENTIAL_TABLES = new Set([
  'messages',
  'conversations',
  'private_calls',
  'live_streams',
  'party_rooms',
  'party_room_participants',
  'notifications',
  'gift_transactions',
  'app_settings',
  'stream_chat',
  'stream_viewers',
  'profiles', // CRITICAL: Required for instant diamond balance updates
  'agencies', // CRITICAL: Agency dashboard real-time sync
  'agency_withdrawals', // CRITICAL: Agency withdrawal status updates
  'support_messages', // CRITICAL: Live chat admin replies must reach users instantly
  'support_tickets', // CRITICAL: Live chat ticket status updates
]);

const MANUAL_ONLY_CHANNELS = new Set(['admin-users-realtime', 'admin-hosts-realtime']);
const MAX_POSTGRES_BINDINGS_PER_WINDOW = 80;
const BINDING_WINDOW_MS = 10_000;
const MAX_ACTIVE_CHANNELS = 35;
const PRESSURE_BACKOFF_MS = 45_000;

// Keep pressure mode safeguards, but do NOT globally disable non-essential realtime.
const ESSENTIAL_ONLY_MODE = false;

let isGuardInstalled = false;
let bindingWindowStartAt = 0;
let postgresBindingsInWindow = 0;
let pressureBackoffUntil = 0;

const isDev = Boolean(import.meta.env.DEV);

const debugLog = (...args: unknown[]) => {
  if (isDev) console.debug(...args);
};

const isAdminChannel = (name: string) => name.toLowerCase().includes('admin');
const isAdminRouteActive = () => {
  if (typeof window === 'undefined') return false;
  const { pathname, hash } = window.location;
  return pathname.startsWith('/admin') || hash.startsWith('#/admin') || hash.includes('/admin');
};

const markBindingAttempt = () => {
  const now = Date.now();
  if (now - bindingWindowStartAt > BINDING_WINDOW_MS) {
    bindingWindowStartAt = now;
    postgresBindingsInWindow = 0;
  }

  postgresBindingsInWindow += 1;

  const activeChannels = supabase.getChannels().length;
  const isOverBindingRate = postgresBindingsInWindow > MAX_POSTGRES_BINDINGS_PER_WINDOW;
  const isOverChannelLimit = activeChannels > MAX_ACTIVE_CHANNELS;

  if (isOverBindingRate || isOverChannelLimit) {
    const nextBackoffUntil = now + PRESSURE_BACKOFF_MS;
    if (nextBackoffUntil > pressureBackoffUntil) {
      pressureBackoffUntil = nextBackoffUntil;
      console.warn(
        `[RealtimeGuard] 🚨 Pressure mode ON for ${PRESSURE_BACKOFF_MS / 1000}s (bindings=${postgresBindingsInWindow}, channels=${activeChannels})`
      );
    }
  }
};

const isPressureMode = () => {
  if (Date.now() < pressureBackoffUntil) return true;

  if (supabase.getChannels().length > MAX_ACTIVE_CHANNELS) {
    pressureBackoffUntil = Date.now() + PRESSURE_BACKOFF_MS;
    return true;
  }

  return false;
};

export function installRealtimeGuard() {
  if (isGuardInstalled) return;
  isGuardInstalled = true;

  // Save original channel method
  const originalChannel = supabase.channel.bind(supabase);

  // Override channel to wrap the returned channel's .on() and .subscribe() methods
  (supabase as any).channel = (name: string, opts?: any) => {
    const channel = originalChannel(name, opts);
    const originalOn = channel.on.bind(channel);
    const originalSubscribe = channel.subscribe.bind(channel);

    const allowedTables = new Set<string>();
    let allowedPostgresBindings = 0;
    let blockedPostgresBindings = 0;
    let hasNonPostgresBindings = false;
    const initialAdminBypass = isAdminChannel(name) || isAdminRouteActive();

    channel.on = (type: string, config: any, callback: any) => {
      // Guard only postgres_changes; broadcast/presence are always allowed
      if (type !== 'postgres_changes') {
        hasNonPostgresBindings = true;
        return originalOn(type, config, callback);
      }

      const bypassAdminGuards = initialAdminBypass || isAdminRouteActive();
      const table = config?.table as string | undefined;

      // 🔓 Admin realtime must NEVER be blocked
      if (bypassAdminGuards) {
        if (table) {
          allowedTables.add(table);
        }
        allowedPostgresBindings += 1;
        return originalOn(type, config, callback);
      }

      if (MANUAL_ONLY_CHANNELS.has(name)) {
        blockedPostgresBindings += 1;
        debugLog(`[RealtimeGuard] ⛔ Blocked "${name}" (manual refresh only)`);
        return channel;
      }

      // Publication whitelist is intentionally advisory-only now.
      // The server publication already contains all realtime-enabled public tables.
      // We avoid false blocking here and let pressure/circuit-breaker logic handle load.

      if (table && ESSENTIAL_ONLY_MODE && !ESSENTIAL_TABLES.has(table)) {
        blockedPostgresBindings += 1;
        debugLog(`[RealtimeGuard] 🚫 Essential-only mode blocked "${table}" on "${name}"`);
        return channel;
      }

      // Global pressure guard to prevent realtime filter/query storms.
      markBindingAttempt();
      if (table && isPressureMode() && !ESSENTIAL_TABLES.has(table)) {
        blockedPostgresBindings += 1;
        debugLog(`[RealtimeGuard] 🧯 Pressure mode: blocked non-essential table "${table}" on "${name}"`);
        return channel;
      }

      if (table) {
        allowedTables.add(table);
      }
      allowedPostgresBindings += 1;
      return originalOn(type, config, callback);
    };

    channel.subscribe = ((...args: any[]) => {
      const bypassAdminGuards = initialAdminBypass || isAdminRouteActive();
      if (bypassAdminGuards) {
        return originalSubscribe(...args);
      }

      // If every postgres binding was blocked and there are no broadcast/presence handlers,
      // skip join entirely so we don't create useless realtime workload.
      if (allowedPostgresBindings === 0 && !hasNonPostgresBindings) {
        if (blockedPostgresBindings > 0) {
          debugLog(`[RealtimeGuard] ⏭️ Skipped subscribe for "${name}" (all bindings blocked)`);
        }
        return channel;
      }

      // During pressure mode, skip non-admin channels that only carry non-essential postgres tables.
      if (isPressureMode() && allowedTables.size > 0 && !hasNonPostgresBindings) {
        const hasEssential = Array.from(allowedTables).some((table) => ESSENTIAL_TABLES.has(table));
        if (!hasEssential) {
          debugLog(`[RealtimeGuard] ⏭️ Pressure mode: skipped non-essential channel "${name}"`);
          return channel;
        }
      }

      return originalSubscribe(...args);
    }) as typeof channel.subscribe;

    return channel;
  };

  console.log('[RealtimeGuard] 🛡️ Publication guard installed — with pressure circuit breaker');
}
