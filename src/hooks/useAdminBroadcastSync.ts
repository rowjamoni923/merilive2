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

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

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
const TOPIC_QUERY_KEYS: Record<string, string[][]> = {
  banners: [['banners'], ['active-banners'], ['home-banners']],
  popup_event_banners: [['popup-event-banners']],
  rating_banners: [['rating-banners']],
  onboarding_slides: [['onboarding-slides']],
  app_content: [['app-content']],
  landing_page_sections: [['landing-page-sections']],

  gifts: [['gifts'], ['active-gifts']],
  avatar_frames: [['avatar-frames'], ['user-frames']],
  role_frames: [['role-frames'], ['user-role-frames']],
  chat_bubbles: [['chat-bubbles'], ['user-chat-bubbles']],
  entry_effects: [['entry-effects'], ['user-entry-effects']],
  entry_banners: [['entry-banners']],
  beauty_filters: [['beauty-filters']],
  ar_stickers: [['ar-stickers']],

  coin_packages: [['coin-packages'], ['diamond-packages'], ['recharge-packages']],
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
  agency_level_tiers: [['agency-level-tiers']],

  invitation_settings: [['invitation-settings']],
  invitation_reward_tiers: [['invitation-reward-tiers']],
  allowed_external_links: [['allowed-external-links']],
  violation_penalty_tiers: [['violation-penalty-tiers']],

  notification_templates: [['notification-templates']],
  admin_notices: [['admin-notices']],
  shop_items: [['shop-items'], ['shop']],
};

let globalChannel: ReturnType<typeof supabase.channel> | null = null;
let mountCount = 0;

export function useAdminBroadcastSync() {
  const qc = useQueryClient();
  const qcRef = useRef(qc);
  qcRef.current = qc;

  useEffect(() => {
    mountCount += 1;

    if (!globalChannel) {
      globalChannel = supabase
        .channel('admin-broadcast-global')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'admin_broadcast' },
          (payload) => {
            const row = (payload.new ?? payload.old) as BroadcastRow | undefined;
            if (!row?.topic) return;
            const topic = row.topic;
            const eventType = (row.last_event ?? payload.eventType ?? 'UPDATE').toUpperCase();

            try {
              window.dispatchEvent(
                new CustomEvent('admin-table-update', {
                  detail: {
                    table: topic,
                    eventType,
                    payload: { version: row.version, row_id: row.last_row_id },
                  },
                })
              );
            } catch {}

            const keys = TOPIC_QUERY_KEYS[topic];
            if (keys?.length) {
              for (const key of keys) {
                try {
                  qcRef.current.invalidateQueries({ queryKey: key, refetchType: 'active' });
                } catch {}
              }
            }
          }
        )
        .subscribe();
    }

    return () => {
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
