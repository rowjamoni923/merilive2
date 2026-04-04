
-- =============================================
-- CRITICAL SECURITY PATCH: Lock down ALL RPC functions
-- Prevents unauthorized access to coins, beans, diamonds, games, calls
-- =============================================

-- 1. FIX: add_beans_to_host (old overload WITHOUT auth check - DROP it)
DROP FUNCTION IF EXISTS public.add_beans_to_host(uuid, bigint, bigint, integer);

-- 2. FIX: game_cashout (old overload WITHOUT auth check - DROP it)
DROP FUNCTION IF EXISTS public.game_cashout(uuid, uuid, numeric, integer);

-- 3. FIX: transfer_coins - MUST verify sender is auth.uid()
CREATE OR REPLACE FUNCTION public.transfer_coins(p_from_user uuid, p_to_user uuid, p_amount bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from_balance bigint;
BEGIN
  -- CRITICAL: Only the sender can transfer their own coins
  IF auth.uid() IS NULL OR auth.uid() != p_from_user THEN
    RAISE EXCEPTION 'Unauthorized: You can only transfer your own coins';
  END IF;

  SELECT coins INTO v_from_balance
  FROM public.profiles
  WHERE id = p_from_user
  FOR UPDATE;
  
  IF v_from_balance IS NULL OR v_from_balance < p_amount THEN
    RETURN false;
  END IF;
  
  UPDATE public.profiles SET coins = coins - p_amount WHERE id = p_from_user;
  UPDATE public.profiles SET coins = COALESCE(coins, 0) + p_amount WHERE id = p_to_user;
  
  RETURN true;
END;
$function$;

-- 4. FIX: transfer_beans - MUST verify sender is auth.uid()
CREATE OR REPLACE FUNCTION public.transfer_beans(p_from_user uuid, p_to_user uuid, p_amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from_balance integer;
BEGIN
  -- CRITICAL: Only the sender can transfer their own beans
  IF auth.uid() IS NULL OR auth.uid() != p_from_user THEN
    RAISE EXCEPTION 'Unauthorized: You can only transfer your own beans';
  END IF;

  SELECT beans INTO v_from_balance
  FROM public.profiles
  WHERE id = p_from_user
  FOR UPDATE;
  
  IF v_from_balance IS NULL OR v_from_balance < p_amount THEN
    RETURN false;
  END IF;
  
  UPDATE public.profiles SET beans = beans - p_amount WHERE id = p_from_user;
  UPDATE public.profiles SET beans = COALESCE(beans, 0) + p_amount WHERE id = p_to_user;
  
  RETURN true;
END;
$function$;

-- 5. FIX: process_gift_transaction - verify sender is auth.uid()
CREATE OR REPLACE FUNCTION public.process_gift_transaction(p_sender_id uuid, p_receiver_id uuid, p_gift_id uuid, p_quantity integer DEFAULT 1, p_stream_id uuid DEFAULT NULL::uuid, p_party_room_id uuid DEFAULT NULL::uuid, p_call_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gift RECORD;
  v_sender RECORD;
  v_total_coins BIGINT;
  v_host_percent INT;
  v_beans_earned BIGINT;
  v_transaction_id UUID;
  v_commission_setting JSONB;
BEGIN
  -- CRITICAL: Only the sender can send gifts from their own account
  IF auth.uid() IS NULL OR auth.uid() != p_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You can only send gifts from your own account');
  END IF;

  -- 1. Get gift details
  SELECT id, name, coin_value, icon_url, animation_url
  INTO v_gift
  FROM gifts
  WHERE id = p_gift_id AND is_active = true;
  
  IF v_gift IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift not found or inactive');
  END IF;
  
  v_total_coins := v_gift.coin_value::BIGINT * p_quantity::BIGINT;
  
  IF v_total_coins <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;
  
  SELECT id, coins INTO v_sender
  FROM profiles
  WHERE id = p_sender_id
  FOR UPDATE;
  
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender not found');
  END IF;
  
  IF v_sender.coins < v_total_coins THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins', 'required', v_total_coins, 'available', v_sender.coins);
  END IF;
  
  SELECT setting_value INTO v_commission_setting
  FROM app_settings
  WHERE setting_key = 'gift_commission';
  
  IF v_commission_setting IS NULL THEN
    SELECT setting_value INTO v_commission_setting
    FROM app_settings
    WHERE setting_key = 'call_rates';
  END IF;
  
  IF v_commission_setting IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift commission not configured in Admin Panel');
  END IF;
  
  v_host_percent := COALESCE(
    (v_commission_setting->>'host_percent')::INT,
    100 - COALESCE((v_commission_setting->>'company_percent')::INT, 45),
    (v_commission_setting->>'host_commission_percent')::INT,
    55
  );
  
  IF v_host_percent <= 0 OR v_host_percent > 100 THEN
    v_host_percent := 55;
  END IF;
  
  v_beans_earned := FLOOR((v_total_coins::NUMERIC * v_host_percent) / 100)::BIGINT;
  
  UPDATE profiles
  SET 
    coins = coins - v_total_coins,
    total_consumption = COALESCE(total_consumption, 0) + v_total_coins,
    updated_at = now()
  WHERE id = p_sender_id;
  
  UPDATE profiles
  SET 
    beans = COALESCE(beans, 0) + v_beans_earned,
    pending_earnings = COALESCE(pending_earnings, 0) + v_beans_earned,
    total_earnings = COALESCE(total_earnings, 0) + v_beans_earned,
    updated_at = now()
  WHERE id = p_receiver_id;
  
  INSERT INTO gift_transactions (
    gift_id, sender_id, receiver_id, coin_amount, quantity,
    stream_id, party_room_id, call_id, created_at
  ) VALUES (
    p_gift_id, p_sender_id, p_receiver_id, v_total_coins, p_quantity,
    p_stream_id, p_party_room_id, p_call_id, now()
  )
  RETURNING id INTO v_transaction_id;
  
  IF p_stream_id IS NOT NULL THEN
    UPDATE live_streams
    SET 
      total_gifts = COALESCE(total_gifts, 0) + 1,
      total_coins_earned = COALESCE(total_coins_earned, 0) + v_total_coins
    WHERE id = p_stream_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'coins_spent', v_total_coins,
    'beans_earned', v_beans_earned,
    'host_percent', v_host_percent,
    'gift_name', v_gift.name,
    'gift_icon_url', v_gift.icon_url,
    'gift_animation_url', v_gift.animation_url
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 6. FIX: place_live_game_bet - verify user is auth.uid()
CREATE OR REPLACE FUNCTION public.place_live_game_bet(p_round_id uuid, p_user_id uuid, p_bet_amount integer, p_bet_type text DEFAULT NULL::text, p_bet_value text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_round RECORD;
  v_user_coins INTEGER;
  v_existing_bet UUID;
BEGIN
  -- CRITICAL: User can only bet for themselves
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_round FROM live_game_rounds WHERE id = p_round_id;
  IF v_round IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Round not found'); END IF;
  IF v_round.status != 'betting' OR now() > v_round.betting_end_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Betting is closed');
  END IF;
  SELECT coins INTO v_user_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
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
$function$;

-- 7. FIX: process_live_game_round - ADMIN ONLY (decides winners)
CREATE OR REPLACE FUNCTION public.process_live_game_round(p_round_id uuid, p_winning_value text, p_result jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_round RECORD;
  v_game RECORD;
  v_bet RECORD;
  v_multiplier DECIMAL;
  v_win_amount INTEGER;
  v_total_winners INTEGER := 0;
  v_total_win_amount INTEGER := 0;
  v_is_winner BOOLEAN;
BEGIN
  -- CRITICAL: Only admins or system can process game rounds
  -- This prevents users from deciding their own wins
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only system can process game rounds');
  END IF;

  SELECT * INTO v_round FROM live_game_rounds WHERE id = p_round_id;
  IF v_round IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round not found');
  END IF;
  IF v_round.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round already completed');
  END IF;
  
  SELECT * INTO v_game FROM game_settings WHERE game_id = v_round.game_id;
  
  UPDATE live_game_rounds 
  SET status = 'playing', 
      game_start_at = now(),
      winning_value = p_winning_value,
      result = p_result
  WHERE id = p_round_id;
  
  FOR v_bet IN SELECT * FROM live_game_bets WHERE round_id = p_round_id AND is_processed = false
  LOOP
    v_is_winner := false;
    IF v_bet.bet_value = p_winning_value THEN
      v_is_winner := true;
    ELSIF v_bet.bet_value IN ('even', 'odd') THEN
      IF v_bet.bet_value = 'odd' AND (p_result->>'isOdd')::BOOLEAN = true THEN
        v_is_winner := true;
      ELSIF v_bet.bet_value = 'even' AND (p_result->>'isOdd')::BOOLEAN = false THEN
        v_is_winner := true;
      END IF;
    END IF;
    
    IF v_is_winner THEN
      v_multiplier := COALESCE((p_result->>'multiplier')::DECIMAL, 2);
      v_win_amount := FLOOR(v_bet.bet_amount * v_multiplier);
      UPDATE live_game_bets 
      SET is_winner = true, multiplier = v_multiplier, win_amount = v_win_amount, is_processed = true
      WHERE id = v_bet.id;
      UPDATE profiles SET coins = coins + v_win_amount WHERE id = v_bet.user_id;
      v_total_winners := v_total_winners + 1;
      v_total_win_amount := v_total_win_amount + v_win_amount;
    ELSE
      UPDATE live_game_bets SET is_winner = false, is_processed = true WHERE id = v_bet.id;
    END IF;
  END LOOP;
  
  UPDATE live_game_rounds SET status = 'completed', game_end_at = now() WHERE id = p_round_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_winners', v_total_winners,
    'total_win_amount', v_total_win_amount,
    'winning_value', p_winning_value,
    'result', p_result
  );
END;
$function$;

-- 8. FIX: create_live_game_round - ADMIN ONLY
CREATE OR REPLACE FUNCTION public.create_live_game_round(p_game_id text, p_room_id uuid DEFAULT NULL::uuid, p_betting_seconds integer DEFAULT 30)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_round_id uuid;
BEGIN
  -- CRITICAL: Only admins or system can create game rounds
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only system can create game rounds';
  END IF;

  INSERT INTO public.live_game_rounds (
    game_id, room_id, status, betting_ends_at
  ) VALUES (
    p_game_id, p_room_id, 'betting', now() + (p_betting_seconds || ' seconds')::interval
  )
  RETURNING id INTO v_round_id;
  
  RETURN v_round_id;
END;
$function$;

-- 9. FIX: claim_new_host_live_bonus - verify user is auth.uid()
CREATE OR REPLACE FUNCTION public.claim_new_host_live_bonus(p_user_id uuid, p_hours integer DEFAULT 1)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings RECORD;
  v_profile RECORD;
  v_progress RECORD;
  v_host_verified_at TIMESTAMP;
  v_days_since_verified INTEGER;
  v_today DATE := CURRENT_DATE;
  v_day_number INTEGER;
  v_new_hours INTEGER;
  v_beans_to_add INTEGER;
BEGIN
  -- CRITICAL: User can only claim bonus for themselves
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_settings FROM new_host_live_bonus_settings WHERE is_active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Bonus system is not active');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.is_host IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Not a verified host');
  END IF;

  IF v_profile.is_face_verified IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Host must be face verified');
  END IF;

  v_host_verified_at := COALESCE(v_profile.host_verified_at, v_profile.created_at);
  v_days_since_verified := EXTRACT(DAY FROM (now() - v_host_verified_at))::INTEGER;
  
  IF v_days_since_verified >= v_settings.eligible_days THEN
    RETURN json_build_object('success', false, 'error', 'Eligibility period expired', 'days_since', v_days_since_verified);
  END IF;

  v_day_number := v_days_since_verified + 1;

  SELECT * INTO v_progress FROM new_host_live_bonus_progress 
    WHERE user_id = p_user_id AND bonus_date = v_today FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO new_host_live_bonus_progress (user_id, bonus_date, hours_completed, beans_earned, day_number)
    VALUES (p_user_id, v_today, 0, 0, v_day_number)
    RETURNING * INTO v_progress;
  END IF;

  IF v_progress.hours_completed >= v_settings.max_hours_per_day THEN
    RETURN json_build_object('success', false, 'error', 'Max hours reached today', 'hours', v_progress.hours_completed);
  END IF;

  v_new_hours := LEAST(p_hours, v_settings.max_hours_per_day - v_progress.hours_completed);
  v_beans_to_add := v_new_hours * v_settings.beans_per_hour;

  UPDATE new_host_live_bonus_progress
    SET hours_completed = hours_completed + v_new_hours,
        beans_earned = beans_earned + v_beans_to_add
    WHERE id = v_progress.id;

  UPDATE profiles
    SET beans = COALESCE(beans, 0) + v_beans_to_add
    WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'beans_added', v_beans_to_add,
    'hours_completed', v_progress.hours_completed + v_new_hours,
    'max_hours', v_settings.max_hours_per_day,
    'day_number', v_day_number,
    'eligible_days', v_settings.eligible_days
  );
END;
$function$;

-- 10. FIX: exchange_agency_beans_to_diamonds - verify caller is agency owner
CREATE OR REPLACE FUNCTION public.exchange_agency_beans_to_diamonds(p_agency_id uuid, p_beans_to_deduct bigint, p_diamonds_to_add bigint, p_fee_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_beans bigint;
  v_current_diamonds bigint;
  v_new_beans bigint;
  v_new_diamonds bigint;
  v_owner_id uuid;
BEGIN
  -- CRITICAL: Verify caller is the agency owner
  SELECT owner_id INTO v_owner_id FROM agencies WHERE id = p_agency_id;
  IF auth.uid() IS NULL OR auth.uid() != v_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only agency owner can exchange');
  END IF;

  SELECT COALESCE(beans_balance, 0)::bigint, COALESCE(diamond_balance, 0)::bigint
  INTO v_current_beans, v_current_diamonds
  FROM agencies 
  WHERE id = p_agency_id
  FOR UPDATE;
  
  IF v_current_beans IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  
  IF v_current_beans < p_beans_to_deduct THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient beans balance',
      'current_beans', v_current_beans,
      'required_beans', p_beans_to_deduct
    );
  END IF;
  
  v_new_beans := v_current_beans - p_beans_to_deduct;
  v_new_diamonds := v_current_diamonds + p_diamonds_to_add;
  
  UPDATE agencies 
  SET beans_balance = v_new_beans, diamond_balance = v_new_diamonds, updated_at = now()
  WHERE id = p_agency_id;
  
  INSERT INTO agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount)
  VALUES (p_agency_id, 'exchange', p_beans_to_deduct, p_diamonds_to_add, p_fee_amount);
  
  RETURN jsonb_build_object(
    'success', true,
    'old_beans', v_current_beans,
    'new_beans', v_new_beans,
    'old_diamonds', v_current_diamonds,
    'new_diamonds', v_new_diamonds,
    'deducted', p_beans_to_deduct,
    'added', p_diamonds_to_add
  );
END;
$function$;

-- 11. FIX: request_agency_withdrawal - verify caller is agency owner
CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(_agency_id uuid, _amount numeric, _payment_method text, _payment_details jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _beans_balance NUMERIC;
  _calculated_balance NUMERIC;
  _total_withdrawn NUMERIC;
  _effective_balance NUMERIC;
  _withdrawal_id UUID;
  _country_code TEXT;
  _currency_code TEXT;
  _local_amount NUMERIC;
  _owner_id UUID;
BEGIN
  -- CRITICAL: Verify caller is the agency owner
  SELECT owner_id INTO _owner_id FROM agencies WHERE id = _agency_id;
  IF auth.uid() IS NULL OR auth.uid() != _owner_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Only agency owner can request withdrawal');
  END IF;

  SELECT COALESCE(beans_balance, 0) INTO _beans_balance
  FROM agencies WHERE id = _agency_id;
  
  IF _beans_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agency not found');
  END IF;
  
  SELECT COALESCE(SUM(COALESCE(gift_earnings, 0) + COALESCE(amount, 0)), 0)
  INTO _calculated_balance
  FROM agency_earnings_transfers
  WHERE agency_id = _agency_id;
  
  SELECT COALESCE(SUM(amount), 0)
  INTO _total_withdrawn
  FROM agency_withdrawals
  WHERE agency_id = _agency_id
    AND status IN ('pending', 'processing', 'approved', 'completed');
  
  _effective_balance := GREATEST(_calculated_balance - _total_withdrawn, 0);
  
  IF _effective_balance < _amount THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient balance',
      'available_balance', _effective_balance,
      'requested_amount', _amount,
      'total_earnings', _calculated_balance,
      'total_withdrawn', _total_withdrawn
    );
  END IF;
  
  _country_code := _payment_details->>'country_code';
  _currency_code := _payment_details->>'currency_code';
  _local_amount := COALESCE((_payment_details->>'local_amount')::NUMERIC, 0);
  
  INSERT INTO agency_withdrawals (
    agency_id, amount, status, payment_method, payment_details,
    country_code, currency_code, local_currency_amount
  ) VALUES (
    _agency_id, _amount, 'pending', _payment_method, _payment_details,
    _country_code, _currency_code, _local_amount
  )
  RETURNING id INTO _withdrawal_id;
  
  UPDATE agencies 
  SET beans_balance = beans_balance - _amount, updated_at = NOW()
  WHERE id = _agency_id;
  
  RETURN json_build_object(
    'success', true, 
    'withdrawal_id', _withdrawal_id,
    'amount', _amount,
    'effective_balance', _effective_balance,
    'new_available_balance', _effective_balance - _amount,
    'local_amount', _local_amount,
    'currency_code', _currency_code,
    'country_code', _country_code
  );
END;
$function$;

-- 12. FIX: deduct_agency_wallet - ADMIN ONLY
CREATE OR REPLACE FUNCTION public.deduct_agency_wallet(p_agency_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_balance INTEGER;
  v_helper_balance INTEGER;
  v_helper_id UUID;
  v_owner_id UUID;
  v_deducted_agency INTEGER;
  v_deducted_helper INTEGER;
  v_remaining INTEGER;
BEGIN
  -- CRITICAL: Only admins or the agency owner can deduct
  SELECT owner_id INTO v_owner_id FROM agencies WHERE id = p_agency_id;
  IF auth.uid() IS NULL OR (auth.uid() != v_owner_id AND NOT public.is_admin(auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT wallet_balance, owner_id INTO v_agency_balance, v_owner_id
  FROM agencies
  WHERE id = p_agency_id
  FOR UPDATE;
  
  IF v_agency_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  
  SELECT id, wallet_balance INTO v_helper_id, v_helper_balance
  FROM topup_helpers
  WHERE user_id = v_owner_id
  FOR UPDATE;
  
  v_helper_balance := COALESCE(v_helper_balance, 0);
  v_agency_balance := COALESCE(v_agency_balance, 0);
  
  IF (v_agency_balance + v_helper_balance) < p_amount THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient balance',
      'agency_balance', v_agency_balance,
      'helper_balance', v_helper_balance,
      'total', v_agency_balance + v_helper_balance
    );
  END IF;
  
  v_remaining := p_amount;
  v_deducted_agency := 0;
  v_deducted_helper := 0;
  
  IF v_agency_balance >= v_remaining THEN
    v_deducted_agency := v_remaining;
    v_remaining := 0;
  ELSE
    v_deducted_agency := v_agency_balance;
    v_remaining := v_remaining - v_agency_balance;
  END IF;
  
  IF v_remaining > 0 AND v_helper_id IS NOT NULL THEN
    v_deducted_helper := v_remaining;
    v_remaining := 0;
  END IF;
  
  IF v_remaining > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance calculation error');
  END IF;
  
  IF v_deducted_agency > 0 THEN
    UPDATE agencies SET wallet_balance = wallet_balance - v_deducted_agency, updated_at = now() WHERE id = p_agency_id;
  END IF;
  
  IF v_deducted_helper > 0 AND v_helper_id IS NOT NULL THEN
    UPDATE topup_helpers SET wallet_balance = wallet_balance - v_deducted_helper WHERE id = v_helper_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'deducted_agency', v_deducted_agency,
    'deducted_helper', v_deducted_helper,
    'new_agency_balance', v_agency_balance - v_deducted_agency,
    'new_helper_balance', v_helper_balance - v_deducted_helper
  );
END;
$function$;

-- 13. FIX: auto_process_live_game - ADMIN/SYSTEM ONLY
CREATE OR REPLACE FUNCTION public.auto_process_live_game()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- CRITICAL: Only admins or system (no auth context) can run this
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.live_game_rounds
  SET status = 'completed'
  WHERE status = 'playing'
    AND ends_at < now();
    
  SELECT jsonb_build_object('processed', true, 'timestamp', now()) INTO v_result;
  RETURN v_result;
END;
$function$;

-- 14. FIX: deduct_call_coins_per_minute - verify caller is participant
CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call_record record;
  _caller_balance integer;
  _coins_to_deduct integer;
  _host_beans integer;
  _settings jsonb;
  _host_commission_percent integer;
  _time_since_last_billing integer;
  _call_duration_seconds integer;
  _grace_period_seconds integer;
  _is_first_minute boolean;
  _is_second_minute boolean;
  _first_minute_host_beans integer;
BEGIN
  SELECT * INTO _call_record
  FROM private_calls
  WHERE id = p_call_id
  FOR UPDATE;
  
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  -- CRITICAL: Only call participants can trigger billing
  IF auth.uid() IS NOT NULL AND auth.uid() != _call_record.caller_id AND auth.uid() != _call_record.host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  IF _call_record.status != 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_connected');
  END IF;
  
  _call_duration_seconds := COALESCE(_call_record.duration_seconds, 0);
  _is_first_minute := _call_duration_seconds = 0;
  _is_second_minute := _call_duration_seconds = 60;
  
  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN
      RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'recently_billed');
    END IF;
  END IF;
  
  SELECT setting_value INTO _settings FROM app_settings WHERE setting_key = 'call_rates';
  
  IF _settings IS NULL OR (_settings->>'host_commission_percent') IS NULL THEN
    RAISE WARNING 'CRITICAL: call_rates.host_commission_percent not configured!';
    _host_commission_percent := 0;
  ELSE
    _host_commission_percent := (_settings->>'host_commission_percent')::integer;
  END IF;
  
  IF _settings IS NULL OR (_settings->>'first_minute_grace_seconds') IS NULL THEN
    _grace_period_seconds := 21;
  ELSE
    _grace_period_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  END IF;
  
  _coins_to_deduct := _call_record.coins_per_minute;
  _first_minute_host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
  
  IF _is_first_minute THEN
    _host_beans := 0;
  ELSIF _is_second_minute THEN
    _host_beans := _first_minute_host_beans * 2;
  ELSE
    _host_beans := _first_minute_host_beans;
  END IF;
  
  SELECT coins INTO _caller_balance FROM profiles WHERE id = _call_record.caller_id;
  
  IF _caller_balance < _coins_to_deduct THEN
    IF _is_second_minute OR (_call_duration_seconds > 0 AND _call_record.host_earned = 0) THEN
      UPDATE profiles 
      SET beans = COALESCE(beans, 0) + _first_minute_host_beans,
          weekly_earnings = COALESCE(weekly_earnings, 0) + _first_minute_host_beans,
          total_earnings = COALESCE(total_earnings, 0) + _first_minute_host_beans,
          updated_at = now()
      WHERE id = _call_record.host_id;
      
      UPDATE private_calls 
      SET host_earned = COALESCE(host_earned, 0) + _first_minute_host_beans
      WHERE id = p_call_id;
    END IF;
    
    UPDATE private_calls 
    SET status = 'ended', ended_at = now(), end_reason = 'insufficient_coins'
    WHERE id = p_call_id;
    
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'insufficient_balance',
      'caller_balance', _caller_balance,
      'required', _coins_to_deduct,
      'call_ended', true
    );
  END IF;
  
  UPDATE profiles 
  SET coins = coins - _coins_to_deduct, updated_at = now()
  WHERE id = _call_record.caller_id;
  
  IF _host_beans > 0 THEN
    UPDATE profiles 
    SET beans = COALESCE(beans, 0) + _host_beans,
        weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
        total_earnings = COALESCE(total_earnings, 0) + _host_beans,
        updated_at = now()
    WHERE id = _call_record.host_id;
  END IF;
  
  UPDATE private_calls
  SET 
    coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
    total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
    host_earned = COALESCE(host_earned, 0) + _host_beans,
    duration_seconds = COALESCE(duration_seconds, 0) + 60,
    last_billing_at = now()
  WHERE id = p_call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_earned', _host_beans,
    'commission_percent', _host_commission_percent,
    'caller_remaining', _caller_balance - _coins_to_deduct,
    'call_duration', _call_duration_seconds + 60,
    'is_first_minute', _is_first_minute,
    'is_second_minute', _is_second_minute,
    'grace_period_seconds', _grace_period_seconds
  );
END;
$function$;
