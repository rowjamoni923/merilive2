/**
 * 🔄 Realtime → React Query Bridge
 * 
 * Automatically invalidates React Query caches when Supabase Realtime
 * detects database changes. This ensures sub-1-second updates across
 * the entire app without manual refresh.
 * 
 * OPTIMIZED: Debounced invalidation to prevent excessive refetching
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToTables } from '@/hooks/useUniversalRealtime';
import { clearGiftCache, prefetchGifts } from '@/hooks/useGiftPrefetch';
import { refreshGlobalSettingsCache } from '@/hooks/useGlobalSettings';
import { clearEntryAnimationCache } from '@/utils/fetchEntryAnimation';
import { clearAllFrameCaches } from '@/utils/frameCache';

// Tables added to supabase_realtime publication for instant admin→app sync
const TABLE_TO_QUERY_KEYS: Record<string, string[][]> = {
  live_streams: [['index-hosts-v4'], ['live-stream'], ['active-streams']],
  conversations: [['conversations'], ['recent-chats']],
  messages: [['messages'], ['conversations']],
  gift_transactions: [['user-profile'], ['gift-history'], ['host-rankings-v2'], ['gifter-rankings-v2'], ['game-rankings-v2']],
  party_rooms: [['party-rooms'], ['index-hosts-v4']],
  party_room_participants: [['party-rooms'], ['index-hosts-v4']],
  private_calls: [['private-calls'], ['call-history'], ['index-hosts-v4'], ['host-rankings-v2']],
  notifications: [['notifications']],
  app_settings: [['app-settings'], ['global-settings']],
  agencies: [['agencies'], ['agency-details']],
  agency_withdrawals: [['agency-withdrawals']],
  agency_hosts: [['agency-hosts'], ['agency-details']],
  support_tickets: [['support-tickets']],
  support_messages: [['support-messages']],
  // Admin-controlled tables — instant upgrade in app when admin changes them
  banners: [['banners'], ['home-banners']],
  gifts: [['gifts'], ['gift-categories']],
  shop_items: [['shop-items'], ['shop-categories']],
  coin_packages: [['coin-packages']],
  avatar_frames: [['avatar-frames'], ['frames']],
  vip_tiers: [['vip-tiers'], ['vip-packages']],
  daily_login_rewards_config: [['daily-rewards']],
  branding_settings: [['branding-settings']],
  app_version_settings: [['app-version']],
  admin_notices: [['admin-notices']],
  categories: [['categories']],
  ar_stickers: [['ar-stickers']],
  beauty_filters: [['beauty-filters']],
  admin_music_library: [['music-library']],
  // Helper/Trader tables — instant level & wallet sync
  topup_helpers: [['helper-data'], ['user-profile']],
  trader_level_tiers: [['trader-levels'], ['helper-data']],
  helper_upgrade_requests: [['upgrade-requests'], ['helper-data']],
  topup_payment_methods: [['payment-methods']],
  helper_diamond_packages: [['diamond-packages']],
  helper_notifications: [['notifications']],
  // Agency performance & rankings
  agency_performance: [['agency-details'], ['agency-performance']],
  agency_rankings: [['agency-rankings']],
  agency_level_tiers: [['agency-levels']],
  agency_earnings_transfers: [['agency-details'], ['agency-earnings']],
  agency_commission_history: [['agency-details'], ['agency-commission']],
  agency_policy_settings: [['agency-policy']],
  // Face verification & host management
  face_verification_submissions: [['face-verification'], ['user-profile']],
  host_applications: [['host-applications'], ['user-profile']],
  host_conversion_requests: [['host-conversion']],
  // Level & VIP system
  user_level_tiers: [['level-tiers'], ['user-profile']],
  level_privileges: [['level-privileges']],
  feature_level_requirements: [['feature-levels']],
  vip_exclusive_items: [['vip-items']],
  user_vip_subscriptions: [['vip-subscriptions'], ['user-profile']],
  // Game system
  game_settings: [['game-settings']],
  game_providers: [['game-providers']],
  live_game_rounds: [['game-rounds']],
  // Visual assets
  role_frames: [['role-frames']],
  entry_banners: [['entry-banners']],
  entry_name_bars: [['entry-name-bars']],
  vehicle_entrances: [['vehicle-entrances']],
  onboarding_slides: [['onboarding-slides']],
  popup_event_banners: [['popup-banners']],
  party_room_backgrounds: [['party-backgrounds']],
  party_room_banners: [['party-banners']],
  app_event_themes: [['event-themes'], ['branding-settings']],
  app_icon_registry: [['icon-registry']],
  // Content & moderation
  reels: [['reels']],
  live_bans: [['live-bans']],
  chat_moderation_logs: [['chat-moderation']],
  notification_templates: [['notification-templates']],
  allowed_external_links: [['allowed-links']],
  landing_page_sections: [['landing-page']],
  app_content: [['app-content']],
  // Financial
  coin_transactions: [['coin-transactions'], ['user-profile']],
  payment_gateways: [['payment-gateways']],
  first_recharge_bonus: [['first-recharge']],
  limited_time_offers: [['limited-offers']],
  consumption_return_config: [['consumption-return']],
  currency_rates: [['currency-rates']],
  // Rewards & tasks
  leaderboard_reward_config: [['leaderboard-rewards']],
  leaderboard_podium_frames: [['podium-frames']],
  ranking_rewards: [['ranking-rewards']],
  daily_tasks: [['daily-tasks']],
  parcel_templates: [['parcels']],
  lucky_gift_config: [['lucky-gift']],
  invitation_settings: [['invitation-settings']],
  // Misc
  followers: [['followers'], ['user-profile']],
  blocked_users: [['blocked-users']],
  user_purchases: [['user-purchases'], ['user-profile']],
  stream_recordings: [['recordings']],
  admin_notifications: [['admin-notifications']],
  admin_logs: [['admin-logs']],
  // Helper orders & management
  helper_orders: [['helper-orders']],
  helper_applications: [['helper-applications']],
  helper_transactions: [['helper-transactions']],
  payroll_requests: [['payroll-orders']],
  user_reports: [['user-reports']],
};

// Keep the global bridge scoped to tables that are actually in the Supabase
// realtime publication. Binding every cache-mapped table was pushing the
// realtime guard into pressure mode and could prevent the home host feed from
// receiving profile online/offline events reliably.
const REALTIME_PUBLICATION_TABLES = new Set([
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

// Table-specific debounce tuning for near-instant cache sync
const TABLE_DEBOUNCE_MS: Record<string, number> = {
  profiles: 500,
  private_calls: 180,
  live_streams: 180,
  gift_transactions: 180,
  messages: 120,
};
const DEFAULT_DEBOUNCE_MS = 160;

// Heavy home query protection: prevent refetch storms from high-frequency realtime updates
const QUERY_KEY_MIN_INVALIDATE_MS: Record<string, number> = {
  'index-hosts-v4': 800,
  'live-stream': 3000,
  'active-streams': 3000,
};

const GLOBAL_SETTINGS_TABLES = new Set([
  'app_settings',
  'agency_level_tiers',
  'helper_level_config',
  'trader_level_tiers',
  'vip_tiers',
  'user_level_tiers',
]);

const GIFT_CACHE_TABLES = new Set(['gifts', 'gift_categories']);
const ENTRY_ASSET_CACHE_TABLES = new Set(['entry_banners', 'entry_name_bars', 'shop_items', 'level_privileges', 'vip_tiers']);
const FRAME_CACHE_TABLES = new Set(['avatar_frames', 'role_frames', 'user_role_frames', 'shop_items', 'profiles']);

// Profiles handled separately
const PROFILE_QUERY_KEYS: string[][] = [['user-profile'], ['host-profile']];
const PROFILE_HOME_QUERY_KEYS: string[][] = [['index-hosts-v4'], ['host-countries']];

// NOTE: Universal realtime flattens the payload to just `new` (or `old` for DELETE),
// so we cannot reliably diff field-by-field. The home query is throttled to 800ms
// in QUERY_KEY_MIN_INVALIDATE_MS, so always invalidating on any profile change is safe
// and necessary for is_online / host_availability toggles to appear without refresh.
const shouldInvalidateHomeForProfileChange = (_payload: any) => true;

// All tables we want to sync — MUST match publication
const SYNCED_TABLES = Array.from(
  new Set([...Object.keys(TABLE_TO_QUERY_KEYS), 'profiles'])
).filter((table) => REALTIME_PUBLICATION_TABLES.has(table));

export const useRealtimeQuerySync = () => {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    const subscriberId = `rq-sync-${Date.now()}`;
    const pendingInvalidations = new Map<string, NodeJS.Timeout>();
    const lastInvalidatedAt = new Map<string, number>();

    const invalidateWithDebounce = (table: string, keys: string[][]) => {
      const existing = pendingInvalidations.get(table);
      if (existing) clearTimeout(existing);

      const delay = TABLE_DEBOUNCE_MS[table] ?? DEFAULT_DEBOUNCE_MS;

      const timer = setTimeout(() => {
        const now = Date.now();

        keys.forEach((key) => {
          const rootKey = String(key[0] ?? '');
          const minInterval = QUERY_KEY_MIN_INVALIDATE_MS[rootKey] ?? 0;
          const throttleKey = JSON.stringify(key);
          const lastAt = lastInvalidatedAt.get(throttleKey) ?? 0;

          if (minInterval > 0 && now - lastAt < minInterval) return;

          lastInvalidatedAt.set(throttleKey, now);
          queryClientRef.current.invalidateQueries({
            queryKey: key,
            refetchType: 'active',
          });
        });

        pendingInvalidations.delete(table);
      }, delay);

      pendingInvalidations.set(table, timer);
    };

    const unsubscribe = subscribeToTables(
      subscriberId,
      SYNCED_TABLES,
      (table, _event, _payload) => {
        if (table === 'profiles') {
          invalidateWithDebounce(table, PROFILE_QUERY_KEYS);

            if (shouldInvalidateHomeForProfileChange(_payload)) {
              invalidateWithDebounce('profiles-home', PROFILE_HOME_QUERY_KEYS);
            }

          return;
        }

        const queryKeys = TABLE_TO_QUERY_KEYS[table];
        if (queryKeys) {
          invalidateWithDebounce(table, queryKeys);
        }

        if (GLOBAL_SETTINGS_TABLES.has(table)) {
          void refreshGlobalSettingsCache();
        }

        if (GIFT_CACHE_TABLES.has(table)) {
          clearGiftCache();
          void prefetchGifts();
        }

        if (ENTRY_ASSET_CACHE_TABLES.has(table)) {
          clearEntryAnimationCache();
        }

        if (FRAME_CACHE_TABLES.has(table)) {
          clearAllFrameCaches();
        }
      }
    );

    return () => {
      // Clear all pending timers
      pendingInvalidations.forEach((timer) => clearTimeout(timer));
      pendingInvalidations.clear();
      unsubscribe();
    };
  }, []);
};
