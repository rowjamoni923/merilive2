/**
 * 🔄 Admin → App Instant Sync (Pkg36)
 *
 * Single global subscription to `public.admin_broadcast`.
 * When admin saves anything in any of the 47 admin-managed tables,
 * a database trigger bumps the matching topic row → this hook
 * receives the change <1s later (web + native Capacitor).
 *
 * It then:
 *   1. Dispatches `admin-table-update` window event (consumed by
 *      useAdminSettingsRealtime + useAdminRealtime + AdminLayout).
 *   2. Invalidates known React Query keys for that topic so end-user
 *      surfaces (feed, shop, gifts, recharge, VIP, leaderboard, …)
 *      refetch immediately without manual refresh.
 *
 * Mount ONCE globally (App.tsx) — works on every route, every device.
 */

import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

type BroadcastRow = {
  topic: string;
  version: number;
  last_event: string | null;
  last_row_id: string | null;
  updated_at: string;
};

// Topic → React Query keys to invalidate when this topic changes.
// Add more keys here as new screens get queries — the underlying
// realtime push already arrives, this just wires it to the cache.
export const TOPIC_QUERY_KEYS: Record<string, string[][]> = {
  // Pkg360 NO-AUTO-REFRESH: removed 'index-hosts-v4' and 'host-feed' from profiles topic.
  // These were causing the main feed to flash/refresh every time ANY user balance or 
  // status changed. The feed now relies on its own 2-min staleTime or explicit 
  // admin-triggered 'feed' topic updates.
  profiles: [['profile'], ['user-profile'], ['user-balance'], ['host-countries']],
  face_verification_submissions: [['face-verification'], ['host-applications'], ['profile'], ['user-profile']],
  user_parcels: [['user-parcels'], ['parcels']],
  swift_pay_topups: [['user-balance'], ['recharge-history'], ['admin-topup-system'], ['admin-recharge-history']],
  account_deletion_requests: [['account-deletion-requests'], ['admin-account-deletion-requests']],

  banners: [['banners'], ['active-banners'], ['home-banners']],
  popup_event_banners: [['popup-event-banners']],
  rating_banners: [['rating-banners']],
  onboarding_slides: [['onboarding-slides']],
  app_content: [['app-content']],
  landing_page_sections: [['landing-page-sections']],

  cost_monitor_samples: [['admin-cost-monitor']],
  cost_monitor_alerts:  [['admin-cost-monitor']],

  gifts: [['gifts'], ['active-gifts']],
  avatar_frames: [['avatar-frames'], ['user-frames']],
  role_frames: [['role-frames'], ['user-role-frames']],
  chat_bubbles: [['chat-bubbles'], ['user-chat-bubbles']],
  entry_effects: [['entry-effects'], ['user-entry-effects']],
  entry_banners: [['entry-banners']],
  beauty_filters: [['beauty-filters']],
  ar_stickers: [['ar-stickers']],

  diamond_packages: [['diamond-packages'], ['diamond-packages'], ['recharge-packages']],
  currency_rates: [['currency-rates']],
  topup_payment_methods: [['topup-payment-methods'], ['payment-methods']],
  branding_settings: [['branding-settings'], ['branding']],
  app_settings: [['app-settings'], ['global-settings'], ['global-app-settings']],
  app_version_settings: [['app-version-settings']],

  vip_tiers: [['vip-tiers'], ['noble-tiers']],
  level_privileges: [['level-privileges']],
  level_animations: [['level-animations']],
  user_level_tiers: [['user-level-tiers'], ['level-tiers']],
  feature_level_requirements: [['feature-level-requirements']],

  game_settings: [['game-settings'], ['games']],
  game_providers: [['game-providers']],
  game_server_settings: [['game-server-settings']],

  daily_tasks: [['daily-tasks'], ['task-center']],
  ranking_rewards: [['ranking-rewards']],
  daily_login_rewards_config: [['daily-login-rewards']],
  first_recharge_bonus: [['first-recharge-bonus']],
  consumption_return_config: [['consumption-return']],
  limited_time_offers: [['limited-time-offers']],
  new_host_live_bonus_settings: [['new-host-live-bonus']],

  leaderboard_reward_config: [['leaderboard-reward-config']],
  leaderboard_podium_frames: [['leaderboard-podium-frames']],

  parcel_templates: [['parcel-templates'], ['user-parcels']],
  helper_level_config: [['helper-level-config']],
  user_beans_exchange_tiers: [['user-beans-exchange-tiers']],
  // Pkg53 additions — User Management
  topup_helpers: [['topup-helpers'], ['level5-helpers'], ['helpers'], ['diamond-traders']],
  host_conversion_requests: [['host-conversion-requests']],
  // Pkg54 additions — Agency/Helper
  helper_orders: [['helper-orders'], ['trader-orders']],
  helper_upgrade_requests: [['helper-upgrade-requests'], ['helper-requests']],
  helper_topup_requests: [['helper-topup-requests'], ['helper-requests']],
  helper_applications: [['helper-applications']],
  helper_transactions: [['helper-transactions'], ['trader-transactions']],
  agency_hosts: [['agency-hosts'], ['agency-detail']],
  diamond_transfers: [['diamond-transfers']],
  // Pkg55 additions — Content/Assets
  user_role_frames: [['user-role-frames'], ['my-role-frames'], ['vip-privileges']],
  // Pkg57 additions — Content/Assets re-audit
  helper_notifications: [['helper-notifications'], ['admin-helper-notifications']],
  // Pkg58 additions — Moderation/Reports re-audit
  admin_permanent_ban_cases: [['admin-permanent-ban-cases'], ['admin-severity-bans']],
  admin_permanent_ban_case_targets: [['admin-permanent-ban-case-targets'], ['admin-severity-bans']],
  blocked_ips: [['blocked-ips'], ['admin-blocked-ips']],
  // Pkg56 additions — Moderation/Reports
  chat_moderation_logs: [['chat-moderation-logs'], ['admin-moderation']],
  support_tickets: [['support-tickets'], ['admin-support-tickets']],
  support_messages: [['support-messages'], ['admin-support-tickets']],
  support_reports: [['support-reports'], ['admin-support-reports']],
  agency_level_tiers: [['agency-level-tiers']],

  invitation_settings: [['invitation-settings']],
  invitation_reward_tiers: [['invitation-reward-tiers']],
  allowed_external_links: [['allowed-external-links']],
  violation_penalty_tiers: [['violation-penalty-tiers']],

  notification_templates: [['notification-templates']],
  admin_notices: [['admin-notices']],
  shop_items: [['shop-items'], ['shop']],

  // Pkg37 additions
  noble_cards: [['noble-cards']],
  noble_tiers: [['noble-tiers']],
  vip_medals: [['vip-medals']],
  vip_perks: [['vip-perks']],
  vip_exclusive_items: [['vip-exclusive-items']],
  premium_animations_hidden: [['premium-animations-hidden']],
  subscription_plans: [['subscription-plans']],

  gift_categories: [['gift-categories']],
  lucky_gift_config: [['lucky-gift-config']],
  diamond_exchange_packages: [['diamond-exchange-packages']],
  helper_diamond_packages: [['helper-diamond-packages']],

  party_room_backgrounds: [['party-room-backgrounds']],
  party_room_banners: [['party-room-banners']],
  room_welcome_messages: [['room-welcome-messages']],
  vehicle_entrances: [['vehicle-entrances']],
  entry_name_bars: [['entry-name-bars']],
  live_moderation_settings: [['live-moderation-settings']],

  game_configs: [['game-configs']],
  provider_games: [['provider-games']],

  pk_reward_banners: [['pk-reward-banners']],
  pk_competitions: [['pk-competitions']],

  helper_payment_methods: [['helper-payment-methods']],
  helper_country_payment_methods: [['helper-country-payment-methods']],
  helper_accepted_payment_methods: [['helper-accepted-payment-methods']],
  helper_assigned_countries: [['helper-assigned-countries']],
  topup_helper_levels: [['topup-helper-levels']],
  trader_level_tiers: [['trader-level-tiers']],
  agency_faqs: [['agency-faqs']],
  agency_policy_settings: [['agency-policy-settings']],

  payment_gateways: [['payment-gateways']],
  payment_methods: [['payment-methods-catalog']],
  recharge_campaigns: [['recharge-campaigns']],

  support_categories: [['support-categories']],
  help_articles: [['help-articles']],

  site_content: [['site-content']],
  site_settings: [['site-settings']],
  app_event_themes: [['app-event-themes']],
  admin_music_library: [['admin-music-library']],
  app_icon_registry: [['app-icon-registry']],

  host_levels: [['host-levels']],
  user_level_thresholds: [['user-level-thresholds']],

  iptv_sources: [['iptv-sources']],
  news_sources: [['news-sources']],
  youtube_sources: [['youtube-sources']],
  reel_categories: [['reel-categories']],

  categories: [['categories']],
  channels: [['channels']],
  sports: [['sports']],
  movies: [['movies']],
  news: [['news']],
  entertainment: [['entertainment']],
  kids_content: [['kids-content']],
  music: [['music']],
  poster_images: [['poster-images']],
  watchlist: [['watchlist']],

  // Pkg52 — user-management + financial admin tables
  live_bans: [['admin-live-bans'], ['live-bans']],
  user_reports: [['admin-user-reports'], ['user-reports']],
  blocked_users: [['admin-blocked-users'], ['blocked-users']],
  host_applications: [['admin-host-applications'], ['host-applications']],
  agencies: [['admin-agencies'], ['agencies'], ['agency-list']],
  admin_pending_actions: [['admin-pending-actions'], ['pending-approvals']],
  agency_withdrawals: [['admin-agency-withdrawals'], ['agency-withdrawals'], ['withdrawals']],
  helper_withdrawal_requests: [['admin-helper-withdrawals'], ['helper-withdrawal-requests']],
  payment_transactions: [['admin-payment-transactions'], ['payment-transactions']],
  recharge_transactions: [['admin-recharge-history'], ['recharge-transactions']],
  agency_commission_history: [['admin-agency-commission-log'], ['agency-commission-history']],
  agency_earnings_transfers: [['admin-agency-earnings'], ['agency-earnings-transfers']],

  // Pkg61 — Admin system/security cross-session sync
  admin_notifications: [['admin-notifications']],
  banned_devices: [['admin-banned-devices'], ['banned-devices']],
  admin_section_permissions: [['admin-section-permissions'], ['admin-sub-admins']],
  admin_sections: [['admin-sections']],
  admin_users: [['admin-users'], ['admin-sub-admins']],
  admin_allowed_devices: [['admin-allowed-devices'], ['admin-device-approvals']],
  host_contact_violations: [['admin-contact-violations'], ['host-contact-violations']],
  rating_reward_claims: [['admin-rating-rewards'], ['rating-reward-claims']],
  rating_reward_audit_log: [['admin-rating-rewards-audit'], ['rating-reward-audit-log']],

  // Pkg62 — Moderation/Reports re-verify (live face violations)
  live_face_violations: [['admin-face-violations'], ['live-face-violations']],
  moderation_audit_log: [['admin-moderation-audit'], ['admin-moderation-audit-stats']],

  // Pkg63 — Admin notification bell — bridge the last 4 alert tables
  helper_message_replies: [['helper-message-replies'], ['admin-finance']],
  payroll_requests: [['admin-payroll-requests'], ['payroll-requests']],
  consumption_return_history: [['consumption-return-history']],
  leaderboard_reward_history: [['leaderboard-reward-history']],
};

let globalChannel: ReturnType<typeof supabase.channel> | null = null;
let mountCount = 0;
let killSwitchChecked = false;
let killSwitchEnabled = true;

// Per-topic client-side dedupe: ignore repeat events on the same topic
// within this window (server already throttles to 500ms; client adds
// belt-and-suspenders to absorb retries / multiple bumps).
const TOPIC_DEDUPE_MS = 2000; // Increased from 400ms to 2s to prevent flash-storms
const lastTopicAt = new Map<string, number>();
const KILL_SWITCH_CACHE_KEY = 'meri_rt_admin_broadcast_enabled_v1';
const KILL_SWITCH_CACHE_MS = 60 * 60_000;

async function checkKillSwitch(): Promise<boolean> {
  if (killSwitchChecked) return killSwitchEnabled;
  try {
    const cached = localStorage.getItem(KILL_SWITCH_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { at: number; value: boolean };
      if (Date.now() - Number(parsed.at || 0) < KILL_SWITCH_CACHE_MS) {
        killSwitchEnabled = parsed.value !== false;
        killSwitchChecked = true;
        return killSwitchEnabled;
      }
    }
  } catch {
    // cache is best-effort
  }
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'realtime_admin_broadcast_enabled')
      .maybeSingle();
    const v = (data as any)?.setting_value;
    killSwitchEnabled = v === true || v === 'true' || v === undefined || v === null;
  } catch {
    killSwitchEnabled = true; // fail-open: don't break sync if check fails
  }
  try { localStorage.setItem(KILL_SWITCH_CACHE_KEY, JSON.stringify({ at: Date.now(), value: killSwitchEnabled })); } catch {}
  killSwitchChecked = true;
  return killSwitchEnabled;
}

export function useAdminBroadcastSync() {
  useEffect(() => {
    mountCount += 1;
    let cancelled = false;

    (async () => {
      const enabled = await checkKillSwitch();
      if (!enabled) {
        console.warn('[AdminBroadcastSync] 🛑 Disabled via app_settings kill switch');
        return;
      }
      if (cancelled || globalChannel) return;

      globalChannel = supabase
        .channel(`admin-broadcast-global-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'admin_broadcast' },
          (payload) => {
            const row = (payload.new ?? payload.old) as BroadcastRow | undefined;
            if (!row?.topic) return;
            const topic = row.topic;

            // Client-side dedupe
            const now = Date.now();
            const last = lastTopicAt.get(topic) ?? 0;
            if (now - last < TOPIC_DEDUPE_MS) return;
            lastTopicAt.set(topic, now);

            const eventType = (row.last_event ?? payload.eventType ?? 'UPDATE').toUpperCase();

            try {
              window.dispatchEvent(
                new CustomEvent('admin-table-update', {
                  detail: {
                    table: topic,
                    eventType,
                    payload: { version: row.version, row_id: row.last_row_id },
                    source: 'admin-broadcast',
                  },
                })
              );
            } catch {}

          }
        )
        .subscribe((status) => {
          // Pkg53: emit channel status so AdminRealtimeSyncIndicator can
          // observe websocket health WITHOUT opening its own channel.
          // (Extra channels = extra realtime cost — caused $1400 bill before.)
          try {
            window.dispatchEvent(
              new CustomEvent('admin-broadcast-status', { detail: { status } })
            );
          } catch {}
        });
    })();

    return () => {
      cancelled = true;
      mountCount = Math.max(0, mountCount - 1);
      if (mountCount === 0 && globalChannel) {
        try {
          supabase.removeChannel(globalChannel);
        } catch {}
        globalChannel = null;
      }
    };
  }, []);
}

export default useAdminBroadcastSync;
