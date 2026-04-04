
-- =============================================
-- FIX: Security Definer View - game_rounds_stats
-- =============================================
DROP VIEW IF EXISTS public.game_rounds_stats;
CREATE VIEW public.game_rounds_stats 
WITH (security_invoker = true)
AS
SELECT lgr.game_id,
    gs.game_name,
    gs.game_emoji,
    count(lgr.id) AS total_rounds,
    sum(lgr.total_bet_amount) AS total_wagered,
    sum(lgr.total_players) AS total_players,
    count(CASE WHEN lgr.status = 'active' THEN 1 ELSE NULL END) AS active_rounds,
    max(lgr.created_at) AS last_round_at
FROM live_game_rounds lgr
LEFT JOIN game_settings gs ON gs.game_id = lgr.game_id
WHERE lgr.created_at > (now() - '24:00:00'::interval)
GROUP BY lgr.game_id, gs.game_name, gs.game_emoji;

-- =============================================
-- FIX: Functions with correct return types + search_path
-- =============================================

-- cancel_account_deletion returns boolean
DROP FUNCTION IF EXISTS public.cancel_account_deletion(uuid);
CREATE FUNCTION public.cancel_account_deletion(user_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET deletion_requested_at = NULL,
      deletion_scheduled_at = NULL
  WHERE id = user_id_param;
  RETURN TRUE;
END;
$$;

-- request_account_deletion returns boolean
DROP FUNCTION IF EXISTS public.request_account_deletion(uuid);
CREATE FUNCTION public.request_account_deletion(user_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET deletion_requested_at = now(),
      deletion_scheduled_at = now() + interval '30 days'
  WHERE id = user_id_param;
  RETURN TRUE;
END;
$$;

-- add_beans_to_host
CREATE OR REPLACE FUNCTION public.add_beans_to_host(
  p_host_id uuid, p_beans_amount bigint, p_total_earnings bigint, p_host_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE profiles
  SET beans_balance = COALESCE(beans_balance, 0) + p_beans_amount,
      total_earnings = COALESCE(total_earnings, 0) + p_total_earnings,
      host_level = GREATEST(COALESCE(host_level, 1), p_host_level),
      updated_at = now()
  WHERE id = p_host_id;
END;
$$;

-- cleanup_expired_otps
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < now();
END;
$$;

-- increment_reel_view
CREATE OR REPLACE FUNCTION public.increment_reel_view(reel_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE reels SET view_count = COALESCE(view_count, 0) + 1 WHERE id = reel_uuid;
END;
$$;

-- find_account_by_face
DROP FUNCTION IF EXISTS public.find_account_by_face(text);
CREATE FUNCTION public.find_account_by_face(face_hash_param text)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, is_deleted boolean, deletion_scheduled_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.is_deleted, p.deletion_scheduled_at
  FROM public.profiles p
  WHERE p.face_hash = face_hash_param AND p.is_host = TRUE
  LIMIT 1;
END;
$$;

-- create_sub_agent
DROP FUNCTION IF EXISTS public.create_sub_agent(uuid, uuid, uuid);
CREATE FUNCTION public.create_sub_agent(_agency_id uuid, _user_id uuid, _referrer_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _referral_code TEXT;
  _sub_agent_id UUID;
BEGIN
  _referral_code := public.generate_sub_agent_referral_code();
  WHILE EXISTS (SELECT 1 FROM sub_agents WHERE referral_code = _referral_code) LOOP
    _referral_code := public.generate_sub_agent_referral_code();
  END LOOP;
  INSERT INTO sub_agents (agency_id, user_id, referrer_id, referral_code)
  VALUES (_agency_id, _user_id, _referrer_id, _referral_code)
  RETURNING id INTO _sub_agent_id;
  RETURN _sub_agent_id;
END;
$$;

-- generate_sub_agent_referral_code
CREATE OR REPLACE FUNCTION public.generate_sub_agent_referral_code()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := 'SA' || upper(substr(md5(random()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;

-- place_live_game_bet
DROP FUNCTION IF EXISTS public.place_live_game_bet(uuid, uuid, integer, text, text);
CREATE FUNCTION public.place_live_game_bet(p_round_id uuid, p_user_id uuid, p_bet_amount integer, p_bet_type text DEFAULT NULL, p_bet_value text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_round RECORD;
  v_user_coins INTEGER;
  v_existing_bet UUID;
BEGIN
  SELECT * INTO v_round FROM live_game_rounds WHERE id = p_round_id;
  IF v_round IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Round not found'); END IF;
  IF v_round.status != 'betting' OR now() > v_round.betting_end_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Betting is closed');
  END IF;
  SELECT coins INTO v_user_coins FROM profiles WHERE id = p_user_id;
  IF v_user_coins < p_bet_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance'); END IF;
  SELECT id INTO v_existing_bet FROM live_game_bets 
  WHERE round_id = p_round_id AND user_id = p_user_id 
    AND COALESCE(bet_type, '') = COALESCE(p_bet_type, '')
    AND COALESCE(bet_value, '') = COALESCE(p_bet_value, '');
  IF v_existing_bet IS NOT NULL THEN
    UPDATE live_game_bets SET bet_amount = bet_amount + p_bet_amount WHERE id = v_existing_bet;
  ELSE
    INSERT INTO live_game_bets (round_id, user_id, bet_amount, bet_type, bet_value) VALUES (p_round_id, p_user_id, p_bet_amount, p_bet_type, p_bet_value);
    UPDATE live_game_rounds SET total_players = total_players + 1 WHERE id = p_round_id;
  END IF;
  UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;
  UPDATE live_game_rounds SET total_bets = total_bets + 1, total_bet_amount = total_bet_amount + p_bet_amount WHERE id = p_round_id;
  RETURN jsonb_build_object('success', true, 'bet_amount', p_bet_amount, 'new_balance', v_user_coins - p_bet_amount);
END;
$$;

-- process_game_bet - keep existing logic, just add search_path
DROP FUNCTION IF EXISTS public.process_game_bet(uuid, text, integer, text, text);
CREATE FUNCTION public.process_game_bet(p_user_id uuid, p_game_id text, p_bet_amount integer, p_bet_type text DEFAULT NULL, p_bet_value text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game_settings RECORD;
  v_is_winner BOOLEAN;
  v_multiplier DECIMAL;
  v_win_amount INTEGER;
  v_random DECIMAL;
  v_user_coins INTEGER;
BEGIN
  SELECT * INTO v_game_settings FROM game_settings WHERE game_id = p_game_id AND is_active = true;
  IF v_game_settings IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Game not found'); END IF;
  IF p_bet_amount < v_game_settings.min_bet OR p_bet_amount > v_game_settings.max_bet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount');
  END IF;
  SELECT coins INTO v_user_coins FROM profiles WHERE id = p_user_id;
  IF v_user_coins < p_bet_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance'); END IF;
  v_random := random() * 100;
  v_is_winner := v_random <= COALESCE(v_game_settings.win_rate, 30);
  IF v_is_winner THEN
    v_multiplier := 1.5 + random() * (COALESCE(v_game_settings.max_multiplier, 5) - 1.5);
    v_win_amount := (p_bet_amount * v_multiplier)::integer;
    UPDATE profiles SET coins = coins - p_bet_amount + v_win_amount WHERE id = p_user_id;
  ELSE
    v_win_amount := 0;
    v_multiplier := 0;
    UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;
  END IF;
  INSERT INTO game_transactions (user_id, game_id, bet_amount, win_amount, multiplier, is_winner, bet_type, bet_value)
  VALUES (p_user_id, p_game_id, p_bet_amount, v_win_amount, v_multiplier, v_is_winner, p_bet_type, p_bet_value);
  RETURN jsonb_build_object('success', true, 'is_winner', v_is_winner, 'multiplier', v_multiplier, 'win_amount', v_win_amount, 'new_balance', v_user_coins - p_bet_amount + v_win_amount);
END;
$$;

-- Trigger functions
CREATE OR REPLACE FUNCTION public.update_game_provider_timestamp()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_sender_level_on_gift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN
  UPDATE profiles SET total_spent = COALESCE(total_spent, 0) + NEW.coins_amount, updated_at = now() WHERE id = NEW.sender_id;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_user_level_on_coin_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_consumption_on_recharge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN
  UPDATE profiles SET total_recharged = COALESCE(total_recharged, 0) + NEW.amount, updated_at = now() WHERE id = NEW.user_id;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_agency_ranking_metrics()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.prevent_negative_agency_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN
  IF NEW.diamond_balance < 0 THEN RAISE EXCEPTION 'Agency balance cannot be negative'; END IF;
  RETURN NEW;
END; $$;
