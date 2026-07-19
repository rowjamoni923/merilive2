
-- ============================================================
-- Zero-Coin Wave A: additive diamond-named generated aliases
-- Every alias = GENERATED ALWAYS AS (legacy_coin_col) STORED
-- Non-breaking. Legacy columns untouched.
-- ============================================================

-- admin_stats
ALTER TABLE public.admin_stats
  ADD COLUMN IF NOT EXISTS total_diamonds_spent integer GENERATED ALWAYS AS (total_coins_spent) STORED;

-- ar_stickers
ALTER TABLE public.ar_stickers
  ADD COLUMN IF NOT EXISTS diamond_price integer GENERATED ALWAYS AS (coin_price) STORED;

-- avatar_frames
ALTER TABLE public.avatar_frames
  ADD COLUMN IF NOT EXISTS price_diamonds integer GENERATED ALWAYS AS (price_coins) STORED;

-- beauty_filters
ALTER TABLE public.beauty_filters
  ADD COLUMN IF NOT EXISTS diamond_price integer GENERATED ALWAYS AS (coin_price) STORED;

-- call_balance_reservations
ALTER TABLE public.call_balance_reservations
  ADD COLUMN IF NOT EXISTS reserved_diamonds integer GENERATED ALWAYS AS (reserved_coins) STORED;

-- call_events
ALTER TABLE public.call_events
  ADD COLUMN IF NOT EXISTS diamond_cost bigint GENERATED ALWAYS AS (coin_cost) STORED;

-- coin_packages
ALTER TABLE public.coin_packages
  ADD COLUMN IF NOT EXISTS diamonds_amount integer GENERATED ALWAYS AS (coins_amount) STORED,
  ADD COLUMN IF NOT EXISTS bonus_diamonds  integer GENERATED ALWAYS AS (bonus_coins)  STORED;

-- coin_transactions
ALTER TABLE public.coin_transactions
  ADD COLUMN IF NOT EXISTS diamonds_amount integer GENERATED ALWAYS AS (coins_amount) STORED;

-- consumption_return_config
ALTER TABLE public.consumption_return_config
  ADD COLUMN IF NOT EXISTS max_return_diamonds integer GENERATED ALWAYS AS (max_return_coins) STORED;

-- daily_login_rewards_config
ALTER TABLE public.daily_login_rewards_config
  ADD COLUMN IF NOT EXISTS reward_diamonds integer GENERATED ALWAYS AS (reward_coins) STORED;

-- daily_tasks
ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS reward_diamonds integer GENERATED ALWAYS AS (reward_coins) STORED;

-- entry_banners
ALTER TABLE public.entry_banners
  ADD COLUMN IF NOT EXISTS price_diamonds integer GENERATED ALWAYS AS (price_coins) STORED;

-- entry_name_bars
ALTER TABLE public.entry_name_bars
  ADD COLUMN IF NOT EXISTS price_diamonds integer GENERATED ALWAYS AS (price_coins) STORED;

-- first_recharge_bonus
ALTER TABLE public.first_recharge_bonus
  ADD COLUMN IF NOT EXISTS bonus_diamonds integer GENERATED ALWAYS AS (bonus_coins) STORED;

-- game_stats
ALTER TABLE public.game_stats
  ADD COLUMN IF NOT EXISTS total_diamonds_won  integer GENERATED ALWAYS AS (total_coins_won)  STORED,
  ADD COLUMN IF NOT EXISTS total_diamonds_lost integer GENERATED ALWAYS AS (total_coins_lost) STORED;

-- gift_self_link_signals
ALTER TABLE public.gift_self_link_signals
  ADD COLUMN IF NOT EXISTS diamond_total bigint GENERATED ALWAYS AS (coin_total) STORED;

-- gift_transaction_logs
ALTER TABLE public.gift_transaction_logs
  ADD COLUMN IF NOT EXISTS total_diamonds integer GENERATED ALWAYS AS (total_coins) STORED;

-- gift_transactions
ALTER TABLE public.gift_transactions
  ADD COLUMN IF NOT EXISTS diamond_amount bigint GENERATED ALWAYS AS (coin_amount) STORED,
  ADD COLUMN IF NOT EXISTS diamond_cost   bigint GENERATED ALWAYS AS (coin_cost)   STORED,
  ADD COLUMN IF NOT EXISTS diamond_value  bigint GENERATED ALWAYS AS (coin_value)  STORED,
  ADD COLUMN IF NOT EXISTS total_diamonds bigint GENERATED ALWAYS AS (total_coins) STORED;

-- gifts
ALTER TABLE public.gifts
  ADD COLUMN IF NOT EXISTS diamond_price integer GENERATED ALWAYS AS (coin_price) STORED,
  ADD COLUMN IF NOT EXISTS diamond_value bigint  GENERATED ALWAYS AS (coin_value) STORED;

-- google_play_purchase_attempts
ALTER TABLE public.google_play_purchase_attempts
  ADD COLUMN IF NOT EXISTS diamonds_amount integer GENERATED ALWAYS AS (coins_amount) STORED;

-- helper_orders
ALTER TABLE public.helper_orders
  ADD COLUMN IF NOT EXISTS diamond_amount bigint GENERATED ALWAYS AS (coin_amount) STORED;

-- helper_topup_requests
ALTER TABLE public.helper_topup_requests
  ADD COLUMN IF NOT EXISTS diamond_amount bigint GENERATED ALWAYS AS (coin_amount) STORED;

-- host_match_preferences
ALTER TABLE public.host_match_preferences
  ADD COLUMN IF NOT EXISTS diamond_rate_per_min integer GENERATED ALWAYS AS (coin_rate_per_min) STORED;

-- invitation_reward_tiers
ALTER TABLE public.invitation_reward_tiers
  ADD COLUMN IF NOT EXISTS reward_diamonds integer GENERATED ALWAYS AS (reward_coins) STORED;

-- leaderboard_reward_config
ALTER TABLE public.leaderboard_reward_config
  ADD COLUMN IF NOT EXISTS reward_diamonds integer GENERATED ALWAYS AS (reward_coins) STORED;

-- leaderboard_reward_history
ALTER TABLE public.leaderboard_reward_history
  ADD COLUMN IF NOT EXISTS reward_diamonds bigint GENERATED ALWAYS AS (reward_coins) STORED;

-- limited_offer_claims
ALTER TABLE public.limited_offer_claims
  ADD COLUMN IF NOT EXISTS diamonds_received integer GENERATED ALWAYS AS (coins_received) STORED;

-- limited_time_offers
ALTER TABLE public.limited_time_offers
  ADD COLUMN IF NOT EXISTS diamonds_amount integer GENERATED ALWAYS AS (coins_amount) STORED;

-- live_streams
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS total_diamonds_earned integer GENERATED ALWAYS AS (total_coins_earned) STORED;

-- parcel_templates
ALTER TABLE public.parcel_templates
  ADD COLUMN IF NOT EXISTS diamond_cost bigint GENERATED ALWAYS AS (coin_cost) STORED;

-- party_room_backgrounds
ALTER TABLE public.party_room_backgrounds
  ADD COLUMN IF NOT EXISTS price_diamonds integer GENERATED ALWAYS AS (price_coins) STORED;

-- pk_battle_gifts
ALTER TABLE public.pk_battle_gifts
  ADD COLUMN IF NOT EXISTS diamond_amount bigint GENERATED ALWAYS AS (coin_amount) STORED;

-- pk_competition_rewards
ALTER TABLE public.pk_competition_rewards
  ADD COLUMN IF NOT EXISTS reward_diamonds integer GENERATED ALWAYS AS (reward_coins) STORED;

-- pk_reward_history
ALTER TABLE public.pk_reward_history
  ADD COLUMN IF NOT EXISTS reward_diamonds integer GENERATED ALWAYS AS (reward_coins) STORED;

-- private_calls
ALTER TABLE public.private_calls
  ADD COLUMN IF NOT EXISTS diamonds_per_minute      bigint GENERATED ALWAYS AS (coins_per_minute)      STORED,
  ADD COLUMN IF NOT EXISTS diamonds_spent           bigint GENERATED ALWAYS AS (coins_spent)           STORED,
  ADD COLUMN IF NOT EXISTS total_diamonds_deducted  bigint GENERATED ALWAYS AS (total_coins_deducted)  STORED;

-- random_call_queue
ALTER TABLE public.random_call_queue
  ADD COLUMN IF NOT EXISTS diamond_rate_per_min integer GENERATED ALWAYS AS (coin_rate_per_min) STORED;

-- random_call_sessions
ALTER TABLE public.random_call_sessions
  ADD COLUMN IF NOT EXISTS diamond_rate_per_min integer GENERATED ALWAYS AS (coin_rate_per_min) STORED,
  ADD COLUMN IF NOT EXISTS diamonds_charged     integer GENERATED ALWAYS AS (coins_charged)     STORED;

-- random_call_settings
ALTER TABLE public.random_call_settings
  ADD COLUMN IF NOT EXISTS diamonds_to_usd_rate                  numeric GENERATED ALWAYS AS (coins_to_usd_rate)                  STORED,
  ADD COLUMN IF NOT EXISTS default_host_rate_diamonds_per_min    integer GENERATED ALWAYS AS (default_host_rate_coins_per_min)    STORED,
  ADD COLUMN IF NOT EXISTS host_max_rate_diamonds_per_min        integer GENERATED ALWAYS AS (host_max_rate_coins_per_min)        STORED,
  ADD COLUMN IF NOT EXISTS host_min_rate_diamonds_per_min        integer GENERATED ALWAYS AS (host_min_rate_coins_per_min)        STORED;

-- ranking_rewards
ALTER TABLE public.ranking_rewards
  ADD COLUMN IF NOT EXISTS reward_diamonds integer GENERATED ALWAYS AS (reward_coins) STORED;

-- rating_reward_claims
ALTER TABLE public.rating_reward_claims
  ADD COLUMN IF NOT EXISTS reward_diamonds integer GENERATED ALWAYS AS (reward_coins) STORED;

-- recharge_transactions
ALTER TABLE public.recharge_transactions
  ADD COLUMN IF NOT EXISTS diamonds_amount  integer GENERATED ALWAYS AS (coins_amount)  STORED,
  ADD COLUMN IF NOT EXISTS bonus_diamonds   integer GENERATED ALWAYS AS (bonus_coins)   STORED,
  ADD COLUMN IF NOT EXISTS diamonds_received integer GENERATED ALWAYS AS (coins_received) STORED;

-- registration_bonus_claims
ALTER TABLE public.registration_bonus_claims
  ADD COLUMN IF NOT EXISTS bonus_diamonds integer GENERATED ALWAYS AS (bonus_coins) STORED;

-- shop_items
ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS price_diamonds integer GENERATED ALWAYS AS (price_coins) STORED;

-- stream_recordings
ALTER TABLE public.stream_recordings
  ADD COLUMN IF NOT EXISTS total_diamonds integer GENERATED ALWAYS AS (total_coins) STORED;

-- swift_pay_topups
ALTER TABLE public.swift_pay_topups
  ADD COLUMN IF NOT EXISTS diamonds_amount integer GENERATED ALWAYS AS (coins_amount) STORED;

-- user_contact_violations
ALTER TABLE public.user_contact_violations
  ADD COLUMN IF NOT EXISTS diamonds_deducted integer GENERATED ALWAYS AS (coins_deducted) STORED;

-- user_parcels
ALTER TABLE public.user_parcels
  ADD COLUMN IF NOT EXISTS diamonds_amount integer GENERATED ALWAYS AS (coins_amount) STORED;

-- vehicle_entrances
ALTER TABLE public.vehicle_entrances
  ADD COLUMN IF NOT EXISTS price_diamonds integer GENERATED ALWAYS AS (price_coins) STORED;

-- Documentation table for the Zero-Coin Wave pipeline
CREATE TABLE IF NOT EXISTS public.zero_coin_wave_log (
  id bigserial PRIMARY KEY,
  wave text NOT NULL,
  note text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zero_coin_wave_log TO authenticated;
GRANT ALL    ON public.zero_coin_wave_log TO service_role;
ALTER TABLE public.zero_coin_wave_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wave_log_admin_read" ON public.zero_coin_wave_log
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

INSERT INTO public.zero_coin_wave_log(wave, note) VALUES
  ('WAVE_A', 'Added diamond-named generated aliases beside all legacy coin* columns. Legacy names retained for backward-compat until Wave C.');
