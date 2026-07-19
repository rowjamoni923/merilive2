// Full database exporter — dumps every public table as JSONL.
// Auth: shared token in Authorization: Bearer <EXPORT_DUMP_TOKEN>.
// Runs with service_role (auto-injected in edge functions), bypasses RLS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${Deno.env.get("EXPORT_DUMP_TOKEN")}`;
  if (auth !== expected) {
    return new Response("unauthorized", { status: 401, headers: corsHeaders });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  const only = url.searchParams.get("table");
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "5000", 10), 10000);

  // Table list — fetched via information_schema through a lightweight RPC or hardcoded
  // We use a direct REST call against pg_meta via service role
  const tablesRes = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/exec_sql_ro`,
    { method: "POST" },
  ).catch(() => null);

  // Fallback: get table list via a simple query using PostgREST introspection
  // Use rpc if available; else return the hardcoded list from client
  let tables: string[] = [];
  if (url.searchParams.get("list") === "1") {
    // Client should call ?list=1 first to get table list
    const { data, error } = await supa.rpc("get_public_tables_list").catch(() => ({ data: null, error: "no_rpc" } as any));
    if (data) tables = data;
    else {
      // Fallback — hard list built from the schema
      tables = HARDCODED_TABLES;
    }
    return new Response(JSON.stringify({ tables }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  if (!only) {
    return new Response("missing ?table=NAME", { status: 400, headers: corsHeaders });
  }

  // Dump one table page
  const { data, error, count } = await supa
    .from(only)
    .select("*", { count: "exact" })
    .range(offset, offset + limit - 1);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(
    JSON.stringify({ table: only, offset, limit, total: count, rows: data }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});

const HARDCODED_TABLES: string[] = [
  "account_deletion_requests","account_lockouts","admin_access_tokens","admin_allowed_devices",
  "admin_broadcast","admin_broadcast_rate_counter","admin_invitations","admin_login_challenges",
  "admin_login_otps","admin_logs","admin_music_library","admin_notices","admin_notifications",
  "admin_owner_whitelist","admin_pending_actions","admin_permanent_ban_case_targets",
  "admin_permanent_ban_cases","admin_pin_otp","admin_pin_trusted_devices","admin_section_permissions",
  "admin_sections","admin_security_pin","admin_sessions","admin_stats","admin_token_overrides",
  "admin_users","agencies","agency_app_otps","agency_commission_history","agency_diamond_transactions",
  "agency_earnings_transfers","agency_faqs","agency_host_requests","agency_hosts","agency_level_tiers",
  "agency_performance","agency_policy_settings","agency_rankings","agency_withdrawal_locks",
  "agency_withdrawals","agent_dispatches","allowed_external_links","app_content","app_event_themes",
  "app_icon_registry","app_settings","app_share_events","app_update_broadcast_log",
  "app_update_check_log","app_version_settings","ar_stickers","avatar_frames","balance_audit_log",
  "banned_devices","banned_face_hashes","banned_ips","banners","beauty_filters","billing_ledger",
  "blocked_ips","blocked_users","branding_settings","bucket_visibility_alerts",
  "call_balance_reservations","call_chat_messages","call_delivery_log","call_e2ee_keys","call_events",
  "categories","channels","chat_bubbles","chat_moderation_logs","diamond_packages","diamond_trader_transfers",
  "diamond_transactions","diamond_transfers","consumption_return_config","consumption_return_history",
  "content_audio_tracks","content_subtitles","conversation_encryption_keys","conversations",
  "cost_monitor_alerts","cost_monitor_snapshots","country_payroll_admin_audit",
  "country_payroll_admin_commissions","country_payroll_admins","country_super_admin_applications",
  "country_super_admin_settings","country_super_admins","csa_diamond_ledger","csa_diamond_purchases",
  "csa_diamond_settings","csa_pending_actions","currency_rates","daily_login_claims",
  "daily_login_rewards_config","daily_tasks","device_tokens","diamond_exchange_packages",
  "email_otps","email_send_log","email_send_state","email_unsubscribe_tokens","entertainment",
  "entry_banners","entry_effects","entry_name_bars","face_records","face_verification_analysis_jobs",
  "face_verification_submissions","failed_login_attempts","feature_level_requirements",
  "first_recharge_bonus","first_recharge_claims","followers","game_configs","game_providers",
  "game_server_settings","game_settings","gift_categories","gift_combo_window","gift_transactions",
  "gifts","group_join_requests","group_members","group_mentions","group_message_reactions",
  "group_messages","group_pinned_messages","groups","helper_accepted_payment_methods",
  "helper_admin_messages","helper_applications","helper_assigned_countries",
  "helper_country_payment_methods","helper_diamond_packages","helper_level_config",
  "helper_message_replies","helper_notifications","helper_orders","helper_payment_methods",
  "helper_payment_visibility_log","helper_topup_requests","helper_transactions",
  "helper_upgrade_requests","helper_withdrawal_requests","host_applications",
  "host_contact_violations","host_conversion_requests","host_levels","host_match_availability",
  "host_match_preferences","host_match_stats","invitation_reward_claims","invitation_reward_tiers",
  "invitation_settings","iptv_sources","kids_content","landing_page_sections",
  "leaderboard_podium_frames","leaderboard_reward_config","leaderboard_reward_history",
  "level_animations","level_privilege_tiers","level_privileges","limited_offer_claims",
  "limited_time_offers","live_bans","live_categories","live_face_warnings","live_moderation_settings",
  "live_raise_hand_queue","live_streams","livekit_participant_forwards","livekit_participant_moves",
  "livekit_permission_updates","lucky_gift_config","lucky_gift_results","managed_banners",
  "message_reactions","messages","movies","music","new_host_live_bonus_progress",
  "new_host_live_bonus_settings","news","news_sources","noble_cards","notification_preferences",
  "notification_templates","notifications","onboarding_slides","otp_orchestrator_settings",
  "otp_provider_config","parcel_claims","parcel_templates","party_room_backgrounds",
  "party_room_banners","party_room_messages","party_room_participants","party_room_seat_locks",
  "party_rooms","payment_gateways","payment_methods","payment_transactions","payroll_requests",
  "phone_otps","pk_battle_assets","pk_battle_gifts","pk_battle_teams","pk_battles",
  "pk_competition_rewards","pk_competitions","pk_participants","pk_reward_banners",
  "pk_reward_history","play_integrity_verdicts","policy_documents","popup_event_banners",
  "poster_images","premium_animations_hidden","private_calls","profiles","profit_config",
  "profit_daily_snapshots","provider_games","push_broadcast_dispatches","random_call_broadcasts",
  "random_call_queue","random_call_ratings","random_call_sessions","random_call_settings",
  "ranking_rewards","rating_banners","rating_reward_claims","recharge_campaigns",
  "recharge_transactions","recovery_tokens","reel_categories","reel_comments","reel_likes",
  "reel_reports","reel_shares","reel_views","reels","registration_bonus_claims","role_frames",
  "room_welcome_messages","roulette_bets","roulette_sessions","saved_reels","seat_invitations",
  "seat_requests","security_alerts","shop_items","site_content","site_settings","sports",
  "stream_chat","stream_recordings","stream_simulcasts","stream_viewers","sub_agent_commissions",
  "sub_agent_referrals","sub_agents","subscription_orders","subscription_plans","support_categories",
  "support_messages","support_reports","support_tickets","swift_pay_topups","topup_helper_levels",
  "topup_helpers","topup_payment_methods","trader_level_purchases","trader_level_tiers",
  "user_active_sessions","user_beans_exchange_history","user_beans_exchange_tiers",
  "user_beans_exchanges","user_blocks","user_chat_bubbles","user_entry_banners","user_entry_effects",
  "user_feedback","user_gift_shop_entitlements","user_invitations","user_level_thresholds",
  "user_level_tiers","user_levels","user_login_streaks","user_noble_subscriptions","user_parcels",
  "user_payment_claims","user_purchased_backgrounds","user_purchases","user_reports",
  "user_role_frames","user_roles","user_subscriptions","user_task_progress","user_vip_medals",
  "user_vip_subscriptions","vehicle_entrances","violation_penalties","violation_penalty_tiers",
  "vip_daily_rewards_log","vip_exclusive_items","vip_medals","vip_perks","vip_recharge_bonus_log",
  "vip_tiers","wallet_ledger_audit","watchlist","weekly_login_claims","weekly_login_rewards_config",
  "welcome_bonuses","youtube_sources",
];
