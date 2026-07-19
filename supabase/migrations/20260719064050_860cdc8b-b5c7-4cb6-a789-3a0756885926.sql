BEGIN;

CREATE OR REPLACE FUNCTION public.place_game_bet(p_user_id uuid, p_amount bigint, p_game_id text, p_game_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cur bigint; v_new bigint; v_amt bigint; v_label text;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  PERFORM set_config('app.calling_function', 'place_game_bet', true);
  v_amt := GREATEST(0, p_amount);
  IF v_amt <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount'); END IF;
  v_label := NULLIF(trim(COALESCE(p_game_name, '')), '');
  IF v_label IS NULL THEN v_label := NULLIF(trim(COALESCE(p_game_id, '')), ''); END IF;
  IF v_label IS NULL THEN v_label := 'unknown'; END IF;
  SELECT coins INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF v_cur < v_amt THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds',
      'balance', v_cur, 'current_balance', v_cur, 'new_balance', v_cur);
  END IF;
  v_new := v_cur - v_amt;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET diamonds = v_new, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, v_label, 'bet', v_amt, v_cur, v_new);
  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'balance', v_new, 'deducted', v_amt);
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_live_game_bet(p_round_id uuid, p_user_id uuid, p_bet_amount integer, p_bet_type text DEFAULT NULL::text, p_bet_value text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_round RECORD; v_coins integer;
BEGIN
  IF v_caller IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'unauthenticated'); END IF;
  IF p_bet_amount IS NULL OR p_bet_amount <= 0 OR p_bet_amount > 1000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;
  IF public.is_user_live_banned(v_caller) THEN RETURN jsonb_build_object('success', false, 'error', 'banned'); END IF;
  SELECT id, status, betting_end_at, stream_id INTO v_round
  FROM public.live_game_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.status <> 'betting' OR (v_round.betting_end_at IS NOT NULL AND v_round.betting_end_at < now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_not_open');
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_bets WHERE round_id = p_round_id AND user_id = v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_bet');
  END IF;
  SELECT coins INTO v_coins FROM public.profiles WHERE id = v_caller FOR UPDATE;
  IF COALESCE(v_coins, 0) < p_bet_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET diamonds = diamonds - p_bet_amount WHERE id = v_caller;
  INSERT INTO public.game_bets (user_id, round_id, bet_amount, bet_type, bet_value, status)
  VALUES (v_caller, p_round_id, p_bet_amount, p_bet_type, p_bet_value, 'placed');
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN jsonb_build_object('success', true, 'new_balance', v_coins - p_bet_amount);
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_game_bet(p_user_id uuid, p_game_id text, p_bet_amount integer, p_bet_type text DEFAULT NULL::text, p_bet_value text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE user_coins integer; new_bet_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_bet_amount IS NULL OR p_bet_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount');
  END IF;
  SELECT coins INTO user_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF COALESCE(user_coins, 0) < p_bet_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET diamonds = diamonds - p_bet_amount WHERE id = p_user_id;
  INSERT INTO game_bets (user_id, bet_amount, bet_type, bet_value, status)
  VALUES (p_user_id, p_bet_amount, p_bet_type, p_bet_value, 'placed')
  RETURNING id INTO new_bet_id;
  RETURN jsonb_build_object('success', true, 'bet_id', new_bet_id, 'new_balance', user_coins - p_bet_amount);
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_game_win(p_user_id uuid, p_amount bigint, p_game_id text, p_game_name text, p_multiplier numeric DEFAULT NULL::numeric, p_is_jackpot boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cur bigint; v_new bigint; v_amt bigint; v_label text; v_role text := COALESCE(auth.role(), '');
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: use game RPC');
  END IF;
  v_amt := GREATEST(0, COALESCE(p_amount, 0));
  IF v_amt <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid win amount'); END IF;
  v_label := NULLIF(btrim(COALESCE(p_game_name, '')), '');
  IF v_label IS NULL THEN v_label := NULLIF(btrim(COALESCE(p_game_id, '')), ''); END IF;
  IF v_label IS NULL THEN v_label := 'unknown'; END IF;
  PERFORM set_config('app.calling_function', 'process_game_win', true);
  PERFORM set_config('app.bypass_profile_protection','true', true);
  SELECT COALESCE(coins, 0) INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  v_new := v_cur + v_amt;
  UPDATE public.profiles SET diamonds = v_new, updated_at = now() WHERE id = p_user_id;
  BEGIN
    INSERT INTO public.game_transactions (user_id, game_id, game_type, transaction_type,
       amount, bet_amount, win_amount, is_win, result_data, balance_before, balance_after)
    VALUES (p_user_id, COALESCE(p_game_id, v_label), v_label, 'win',
       v_amt, 0, v_amt, true, jsonb_build_object('multiplier', p_multiplier, 'is_jackpot', p_is_jackpot),
       v_cur, v_new);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'balance', v_new, 'added', v_amt);
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_live_game_round(p_round_id uuid, p_winning_value text, p_result text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  bet RECORD; winners integer := 0; total_payout bigint := 0;
  v_caller uuid := auth.uid(); v_stream_id uuid; v_host_id uuid; v_status text;
BEGIN
  SELECT r.stream_id, r.status, ls.host_id INTO v_stream_id, v_status, v_host_id
  FROM public.live_game_rounds r LEFT JOIN public.live_streams ls ON ls.id = r.stream_id
  WHERE r.id = p_round_id FOR UPDATE;
  IF v_stream_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'round_not_found'); END IF;
  IF v_status = 'completed' THEN RETURN jsonb_build_object('success', false, 'error', 'already_processed'); END IF;
  IF current_setting('request.jwt.claim.role', true) <> 'service_role'
     AND NOT public.is_active_admin_session()
     AND (v_caller IS NULL OR v_caller <> v_host_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  UPDATE public.live_game_rounds
  SET status = 'completed', winning_value = p_winning_value, result = p_result, ended_at = now()
  WHERE id = p_round_id;
  FOR bet IN SELECT * FROM public.game_bets WHERE round_id = p_round_id AND status = 'placed' LOOP
    IF bet.bet_value = p_winning_value THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.profiles SET diamonds = diamonds + (bet.bet_amount * 2) WHERE id = bet.user_id;
      UPDATE public.game_bets SET status = 'won', win_amount = bet.bet_amount * 2 WHERE id = bet.id;
      winners := winners + 1;
      total_payout := total_payout + (bet.bet_amount * 2);
    ELSE
      UPDATE public.game_bets SET status = 'lost', win_amount = 0 WHERE id = bet.id;
    END IF;
  END LOOP;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN jsonb_build_object('success', true, 'winners', winners, 'total_payout', total_payout);
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_noble_card(_noble_card_id uuid, _auto_renew boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _user_id UUID := auth.uid(); _card RECORD; _current_balance BIGINT;
  _existing RECORD; _new_expires TIMESTAMPTZ; _subscription_id UUID;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  SELECT * INTO _card FROM public.noble_cards WHERE id = _noble_card_id AND is_active = true FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Noble card not found or inactive'); END IF;
  SELECT COALESCE(coins, 0) INTO _current_balance FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF _current_balance IS NULL OR _current_balance < _card.monthly_diamond_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds',
      'required', _card.monthly_diamond_cost, 'current', COALESCE(_current_balance, 0));
  END IF;
  SELECT * INTO _existing FROM public.user_noble_subscriptions
  WHERE user_id = _user_id AND noble_card_id = _noble_card_id AND is_active = true AND expires_at > now()
  ORDER BY expires_at DESC LIMIT 1 FOR UPDATE;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
  SET diamonds = COALESCE(diamonds, 0) - _card.monthly_diamond_cost, updated_at = now()
  WHERE id = _user_id;
  IF _existing.id IS NOT NULL THEN
    _new_expires := _existing.expires_at + (_card.duration_days || ' days')::INTERVAL;
    UPDATE public.user_noble_subscriptions
    SET expires_at = _new_expires,
        diamonds_spent = diamonds_spent + _card.monthly_diamond_cost,
        auto_renew = _auto_renew, updated_at = now()
    WHERE id = _existing.id RETURNING id INTO _subscription_id;
  ELSE
    UPDATE public.user_noble_subscriptions SET is_active = false, updated_at = now()
    WHERE user_id = _user_id AND is_active = true;
    _new_expires := now() + (_card.duration_days || ' days')::INTERVAL;
    INSERT INTO public.user_noble_subscriptions (user_id, noble_card_id, started_at, expires_at, is_active, auto_renew, diamonds_spent)
    VALUES (_user_id, _noble_card_id, now(), _new_expires, true, _auto_renew, _card.monthly_diamond_cost)
    RETURNING id INTO _subscription_id;
  END IF;
  IF _card.monthly_free_diamonds > 0 THEN
    UPDATE public.profiles
    SET diamonds = COALESCE(diamonds, 0) + _card.monthly_free_diamonds, updated_at = now()
    WHERE id = _user_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'subscription_id', _subscription_id,
    'rank_code', _card.rank_code, 'rank_name', _card.rank_name, 'expires_at', _new_expires,
    'diamonds_spent', _card.monthly_diamond_cost, 'free_diamonds_credited', _card.monthly_free_diamonds);
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_vip_tier(p_user_id uuid, p_tier_id uuid, p_price_diamonds integer, p_tier_level integer, p_duration_days integer, p_equip_updates jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid(); v_tier record; v_profile record;
  v_current_coins bigint; v_new_coins bigint; v_price integer;
  v_duration_days integer; v_expires_at timestamptz; v_update jsonb := '{}'::jsonb;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  IF p_user_id IS DISTINCT FROM uid THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden_user_mismatch'); END IF;
  SELECT * INTO v_tier FROM public.vip_tiers WHERE id = p_tier_id AND is_active = true FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'vip_tier_not_found'); END IF;
  v_price := COALESCE(NULLIF(v_tier.price_diamonds::integer, 0), NULLIF(v_tier.price_monthly::integer, 0), 0);
  v_duration_days := COALESCE(v_tier.duration_days, 30);
  IF v_price <= 0 OR v_duration_days <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_vip_tier_price_or_duration');
  END IF;
  SELECT coins, equipped_frame_id, equipped_entrance_id, equipped_bubble_id,
         previous_frame_id, previous_entrance_id, previous_bubble_id
  INTO v_profile FROM public.profiles WHERE id = uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
  v_current_coins := COALESCE(v_profile.coins, 0);
  IF v_current_coins < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_diamonds',
      'required', v_price, 'current', v_current_coins);
  END IF;
  v_new_coins := v_current_coins - v_price;
  v_expires_at := now() + (v_duration_days || ' days')::interval;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
  SET diamonds = v_new_coins,
    current_vip_tier_id = v_tier.id,
    vip_expires_at = v_expires_at,
    vip_tier = COALESCE(v_tier.tier_level, 1),
    equipped_frame_id = CASE WHEN NULLIF(v_tier.frame_animation_url, '') IS NOT NULL THEN v_tier.id ELSE equipped_frame_id END,
    equipped_entrance_id = CASE WHEN NULLIF(v_tier.entry_animation_url, '') IS NOT NULL THEN v_tier.id ELSE equipped_entrance_id END,
    equipped_bubble_id = CASE WHEN NULLIF(v_tier.bubble_animation_url, '') IS NOT NULL THEN v_tier.id ELSE equipped_bubble_id END,
    previous_frame_id = CASE
      WHEN NULLIF(v_tier.frame_animation_url, '') IS NOT NULL AND v_profile.equipped_frame_id IS DISTINCT FROM v_tier.id
      THEN v_profile.equipped_frame_id ELSE previous_frame_id END,
    previous_entrance_id = CASE
      WHEN NULLIF(v_tier.entry_animation_url, '') IS NOT NULL AND v_profile.equipped_entrance_id IS DISTINCT FROM v_tier.id
      THEN v_profile.equipped_entrance_id ELSE previous_entrance_id END,
    previous_bubble_id = CASE
      WHEN NULLIF(v_tier.bubble_animation_url, '') IS NOT NULL AND v_profile.equipped_bubble_id IS DISTINCT FROM v_tier.id
      THEN v_profile.equipped_bubble_id ELSE previous_bubble_id END,
    updated_at = now()
  WHERE id = uid;
  INSERT INTO public.user_vip_subscriptions (user_id, vip_tier_id, expires_at, is_active)
  VALUES (uid, v_tier.id, v_expires_at, true)
  ON CONFLICT (user_id, vip_tier_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, is_active = true;
  RETURN jsonb_build_object('success', true, 'balance_before', v_current_coins, 'balance_after', v_new_coins,
    'expires_at', v_expires_at, 'price_charged', v_price, 'tier_level', COALESCE(v_tier.tier_level, 1));
END;
$function$;

COMMIT;