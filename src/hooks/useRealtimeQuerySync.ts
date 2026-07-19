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
import { refreshGlobalSettingsCache } from '@/hooks/useGlobalSettings';
import { clearEntryAnimationCache } from '@/utils/fetchEntryAnimation';
import { clearAllFrameCaches } from '@/utils/frameCache';
import { clearSupabaseReadCaches } from '@/utils/supabaseFetchGuard';

// Tables mapped to cache keys. The allowlist below decides which ones may use
// Supabase Realtime; room/live/call/gift fanout stays on LiveKit/FCM + REST.
const TABLE_TO_QUERY_KEYS: Record<string, string[][]> = {
  live_streams: [['active-streams']],
  conversations: [['conversations'], ['recent-chats']],
  messages: [['messages'], ['conversations']],
  gift_transactions: [['gift-history']],
  party_rooms: [['party-rooms']],
  private_calls: [['private-calls'], ['call-history']],
  notifications: [['notifications']],
  app_settings: [['app-settings'], ['global-settings']],
  agencies: [['agencies'], ['agency-details']],
  agency_withdrawals: [['agency-withdrawals']],
  agency_hosts: [['agency-hosts'], ['agency-details']],
  support_tickets: [['support-tickets']],
  support_messages: [['support-messages']],
  // Admin-controlled tables — instant upgrade in app when admin changes them
  banners: [['banners'], ['home-banners'], ['recharge-banners']],
  gifts: [['gifts'], ['gift-categories']],
  shop_items: [['shop-items'], ['shop-categories']],
  diamond_packages: [['diamond-packages']],
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
  diamond_transactions: [['coin-transactions'], ['user-profile']],
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
  user_parcels: [['user-parcels'], ['parcels']],
  parcel_templates: [['parcel-templates'], ['parcels']],
  lucky_gift_config: [['lucky-gift']],
  invitation_settings: [['invitation-settings']],
  swift_pay_topups: [['user-balance'], ['recharge-history']],
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
  // ===== Newly publication-enabled admin tables (Phase 1 sweep) =====
  gift_categories: [['gift-categories'], ['gifts']],
  pk_reward_banners: [['pk-reward-banners']],
  entry_effects: [['entry-effects']],
  chat_bubbles: [['chat-bubbles']],
  room_welcome_messages: [['room-welcome-messages']],
  recharge_campaigns: [['recharge-campaigns']],
  payment_methods: [['payment-methods']],
  diamond_exchange_packages: [['diamond-exchange-packages']],
  profit_config: [['profit-config']],
  subscription_plans: [['subscription-plans']],
  noble_cards: [['noble-cards']],
  vip_medals: [['vip-medals']],
  vip_perks: [['vip-perks']],
  host_levels: [['host-levels']],
  helper_level_config: [['helper-level-config']],
  topup_helper_levels: [['topup-helper-levels']],
  user_level_thresholds: [['user-level-thresholds']],
  level_privilege_tiers: [['level-privilege-tiers']],
  site_content: [['site-content']],
  site_settings: [['site-settings']],
  invitation_reward_tiers: [['invitation-reward-tiers']],
  live_moderation_settings: [['live-moderation-settings']],
  channels: [['channels']],
  game_configs: [['game-configs']],
  game_server_settings: [['game-server-settings']],
  provider_games: [['provider-games']],
  pk_battle_assets: [['pk-battle-assets']],
  pk_competitions: [['pk-competitions']],
  pk_competition_rewards: [['pk-competition-rewards']],
  new_host_live_bonus_settings: [['new-host-live-bonus']],
  help_articles: [['help-articles']],
  support_categories: [['support-categories']],
  iptv_sources: [['iptv-sources']],
  news_sources: [['news-sources']],
  youtube_sources: [['youtube-sources']],
  movies: [['movies']],
  music: [['music']],
  poster_images: [['poster-images']],
  reel_categories: [['reel-categories']],
  agency_faqs: [['agency-faqs']],
  gift_combo_window: [['gift-combo-window']],
  violation_penalty_tiers: [['violation-penalty-tiers']],
};

// Register every table we can invalidate. `subscribeToTables` itself binds
// Supabase Realtime ONLY for publication-safe tables, while non-publication
// tables arrive through Pkg37 `admin-table-update` or Pkg91 `app-sync` events.

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
  'index-hosts-v4': 5000,
  'live-stream': 3000,
  'active-streams': 3000,
  'host-rankings-v2': 10000,
  'gifter-rankings-v2': 10000,
  'game-rankings-v2': 10000,
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
const REST_CACHE_AFFECTED_TABLES = new Set([
  'app_settings', 'banners', 'popup_event_banners', 'rating_banners', 'gifts', 'gift_categories',
  'diamond_packages', 'payment_methods', 'payment_gateways', 'topup_payment_methods', 'vip_tiers',
  'avatar_frames', 'role_frames', 'entry_banners', 'entry_name_bars', 'vehicle_entrances',
]);

// Profiles handled separately
const PROFILE_QUERY_KEYS: string[][] = [['user-profile'], ['host-profile']];
const PROFILE_HOME_QUERY_KEYS: string[][] = [['index-hosts-v4'], ['host-countries']];

const HOME_PROFILE_FIELDS = new Set([
  'is_online',
  'host_availability',
  'is_host',
  'avatar_url',
  'display_name',
  'user_level',
  'host_level',
  'country_code',
  'country_flag',
]);

const shouldInvalidateHomeForProfileChange = (payload: any) => {
  if (!payload || typeof payload !== 'object') return false;
  // Most profile updates are wallet/equipped-asset writes. Re-fetching the full
  // home host list for those makes the whole app feel slow. Only home-visible
  // profile fields should invalidate the heavy home queries.
  return Object.keys(payload).some((key) => HOME_PROFILE_FIELDS.has(key));
};

export const useRealtimeQuerySync = () => {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    const pendingInvalidations = new Map<string, NodeJS.Timeout>();
    const lastInvalidatedAt = new Map<string, number>();

    const invalidateWithDebounce = (table: string, keys: string[][]) => {
      const existing = pendingInvalidations.get(table);
      if (existing) clearTimeout(existing);

      const delay = TABLE_DEBOUNCE_MS[table] ?? DEFAULT_DEBOUNCE_MS;

      const timer = setTimeout(() => {
        const now = Date.now();
        if (REST_CACHE_AFFECTED_TABLES.has(table)) clearSupabaseReadCaches();

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

    const handleTableEvent = (table: string | null | undefined, _event: string | undefined, _payload: any) => {
        if (!table) return;
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
        } else {
          // 🛡️ Safety-net: for any admin table not in the explicit map,
          // invalidate every active query whose root key contains the table
          // name or its kebab-case form. Guarantees 100% admin→app coverage
          // without requiring every hook to declare its key in the map.
          const tableKebab = table.replace(/_/g, '-');
          const tableTokens = [table, tableKebab];
          const fallbackKey = `__fallback__${table}`;
          const existing = pendingInvalidations.get(fallbackKey);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            pendingInvalidations.delete(fallbackKey);
            queryClientRef.current.invalidateQueries({
              predicate: (query) => {
                const root = String(query.queryKey?.[0] ?? '');
                if (!root) return false;
                return tableTokens.some((tok) => root.includes(tok));
              },
              refetchType: 'active',
            });
          }, DEFAULT_DEBOUNCE_MS);
          pendingInvalidations.set(fallbackKey, timer);
        }

        if (GLOBAL_SETTINGS_TABLES.has(table)) {
          void refreshGlobalSettingsCache();
        }

        if (GIFT_CACHE_TABLES.has(table)) {
          try { window.dispatchEvent(new CustomEvent('gift-cache:clear')); } catch {}
        }

        if (ENTRY_ASSET_CACHE_TABLES.has(table)) {
          clearEntryAnimationCache();
        }

        if (FRAME_CACHE_TABLES.has(table)) {
          clearAllFrameCaches();
        }
    };

    // App-wide cache sync must be event-based, not a huge unfiltered DB
    // Realtime subscription. Screen-specific hooks own their own scoped
    // subscriptions; this bridge only reacts to already-filtered user
    // notifications/app-sync and the single admin_broadcast channel.
    const onAppSync = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      handleTableEvent(detail.topic, detail.eventType, detail.payload || detail);
    };
    const onAdminUpdate = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      handleTableEvent(detail.table, detail.eventType, detail.payload || detail);
    };
    const onNotificationsChange = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      handleTableEvent('notifications', detail.eventType, detail.notification || detail.payload || detail);
    };

    window.addEventListener('app-sync', onAppSync as EventListener);
    window.addEventListener('admin-table-update', onAdminUpdate as EventListener);
    window.addEventListener('notifications:change', onNotificationsChange as EventListener);

    return () => {
      // Clear all pending timers
      pendingInvalidations.forEach((timer) => clearTimeout(timer));
      pendingInvalidations.clear();
      window.removeEventListener('app-sync', onAppSync as EventListener);
      window.removeEventListener('admin-table-update', onAdminUpdate as EventListener);
      window.removeEventListener('notifications:change', onNotificationsChange as EventListener);
    };
  }, []);
};
