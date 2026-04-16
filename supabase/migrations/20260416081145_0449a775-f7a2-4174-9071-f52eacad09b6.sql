
-- 1. recalculate_all_agency_levels: Updates agency levels based on weekly earnings
CREATE OR REPLACE FUNCTION public.recalculate_all_agency_levels()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency RECORD;
  _tier RECORD;
  _updated_count INTEGER := 0;
  _weekly_income NUMERIC;
  _period_start TIMESTAMP := date_trunc('week', now());
BEGIN
  FOR _agency IN SELECT id, level, commission_rate FROM agencies WHERE is_active = true
  LOOP
    -- Calculate total host earnings for this week
    SELECT COALESCE(SUM(amount), 0) INTO _weekly_income
    FROM agency_earnings_transfers
    WHERE agency_id = _agency.id
      AND created_at >= _period_start;

    -- Find matching tier
    SELECT * INTO _tier
    FROM agency_level_tiers
    WHERE is_active = true
      AND _weekly_income >= min_weekly_income
      AND _weekly_income <= max_weekly_income
    ORDER BY min_weekly_income DESC
    LIMIT 1;

    IF _tier IS NOT NULL AND (_agency.level IS DISTINCT FROM _tier.level_code OR _agency.commission_rate IS DISTINCT FROM _tier.commission_rate) THEN
      UPDATE agencies
      SET level = _tier.level_code,
          commission_rate = _tier.commission_rate,
          updated_at = now()
      WHERE id = _agency.id;
      _updated_count := _updated_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', _updated_count);
END;
$$;

-- 2. end_private_call: Ends a private call and settles earnings
CREATE OR REPLACE FUNCTION public.end_private_call(_call_id text, _end_reason text DEFAULT 'normal')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call RECORD;
  _duration INTEGER;
  _total_cost INTEGER;
  _host_earning INTEGER;
  _commission_rate NUMERIC;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  SELECT * INTO _call
  FROM private_calls
  WHERE id = _call_id::uuid AND status IN ('active', 'ringing', 'connected');

  IF NOT FOUND THEN
    -- Try to just reset call states anyway
    UPDATE profiles SET is_in_call = false, current_call_id = NULL 
    WHERE current_call_id = _call_id::uuid;
    RETURN true;
  END IF;

  -- Calculate duration
  _duration := GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(_call.started_at, _call.created_at)))::integer);

  -- Calculate cost
  _total_cost := GREATEST(0, (_duration / 60) * COALESCE(_call.coins_per_minute, 0));

  -- Get host commission (default 60%)
  _commission_rate := 0.6;
  _host_earning := (_total_cost * _commission_rate)::integer;

  -- Update call record
  UPDATE private_calls
  SET status = 'ended',
      ended_at = now(),
      duration = _duration,
      total_cost = _total_cost,
      host_earning = _host_earning,
      end_reason = _end_reason
  WHERE id = _call_id::uuid;

  -- Reset both users call status
  UPDATE profiles SET is_in_call = false, current_call_id = NULL
  WHERE id IN (_call.caller_id, _call.host_id);

  -- Add earnings to host
  IF _host_earning > 0 THEN
    UPDATE profiles
    SET beans = COALESCE(beans, 0) + _host_earning
    WHERE id = _call.host_id;
  END IF;

  RETURN true;
END;
$$;

-- 3. helper_transfer_coins_to_user: Transfer coins from helper wallet to user
CREATE OR REPLACE FUNCTION public.helper_transfer_coins_to_user(
  _amount integer,
  _receiver_id uuid,
  _sender_id uuid,
  _sender_type text DEFAULT 'helper'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_balance INTEGER;
  _new_helper_balance INTEGER;
  _new_user_balance INTEGER;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Check helper wallet balance
  SELECT wallet_balance INTO _helper_balance
  FROM topup_helpers
  WHERE user_id = _sender_id AND is_active = true;

  IF NOT FOUND OR _helper_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found or inactive');
  END IF;

  IF _helper_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  -- Deduct from helper wallet
  UPDATE topup_helpers
  SET wallet_balance = wallet_balance - _amount,
      total_sold = COALESCE(total_sold, 0) + _amount
  WHERE user_id = _sender_id AND is_active = true
  RETURNING wallet_balance INTO _new_helper_balance;

  -- Add coins to receiver
  UPDATE profiles
  SET coins = COALESCE(coins, 0) + _amount,
      total_recharged = COALESCE(total_recharged, 0) + _amount
  WHERE id = _receiver_id
  RETURNING coins INTO _new_user_balance;

  IF _new_user_balance IS NULL THEN
    -- Rollback helper deduction
    UPDATE topup_helpers
    SET wallet_balance = wallet_balance + _amount,
        total_sold = COALESCE(total_sold, 0) - _amount
    WHERE user_id = _sender_id;
    RETURN jsonb_build_object('success', false, 'error', 'Receiver not found');
  END IF;

  -- Log the transaction
  INSERT INTO helper_transactions (helper_id, user_id, amount, transaction_type, status, notes)
  SELECT id, _receiver_id, _amount, 'coin_transfer', 'completed', 'Helper coin transfer to user'
  FROM topup_helpers WHERE user_id = _sender_id LIMIT 1;

  -- Log coin transfer
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes)
  VALUES (_sender_id, _receiver_id, _amount, _sender_type, 'completed', 'Helper transfer');

  RETURN jsonb_build_object(
    'success', true,
    'new_helper_balance', _new_helper_balance,
    'new_user_balance', _new_user_balance
  );
END;
$$;

-- 4. helper_transfer_diamonds_to_agency: Transfer diamonds from helper to agency
CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_agency(
  _amount integer,
  _sender_id uuid,
  _sender_type text DEFAULT 'helper',
  _target_agency_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_balance INTEGER;
  _new_helper_balance INTEGER;
  _new_agency_balance INTEGER;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF _target_agency_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency ID required');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Check helper wallet
  SELECT wallet_balance INTO _helper_balance
  FROM topup_helpers
  WHERE user_id = _sender_id AND is_active = true;

  IF NOT FOUND OR _helper_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found or inactive');
  END IF;

  IF _helper_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  -- Deduct from helper
  UPDATE topup_helpers
  SET wallet_balance = wallet_balance - _amount,
      total_sold = COALESCE(total_sold, 0) + _amount
  WHERE user_id = _sender_id AND is_active = true
  RETURNING wallet_balance INTO _new_helper_balance;

  -- Add diamonds to agency
  UPDATE agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount,
      updated_at = now()
  WHERE id = _target_agency_id
  RETURNING diamond_balance INTO _new_agency_balance;

  IF _new_agency_balance IS NULL THEN
    -- Rollback
    UPDATE topup_helpers
    SET wallet_balance = wallet_balance + _amount,
        total_sold = COALESCE(total_sold, 0) - _amount
    WHERE user_id = _sender_id;
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  -- Log transaction
  INSERT INTO helper_transactions (helper_id, user_id, amount, transaction_type, status, notes)
  SELECT id, _sender_id, _amount, 'diamond_to_agency', 'completed', 'Diamonds to agency ' || _target_agency_id
  FROM topup_helpers WHERE user_id = _sender_id LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'new_helper_balance', _new_helper_balance,
    'new_agency_balance', _new_agency_balance
  );
END;
$$;

-- 5. helper_transfer_diamonds_to_self: Helper withdraws diamonds to their own profile
CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(
  _amount integer,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_balance INTEGER;
  _new_helper_balance INTEGER;
  _new_diamond_balance INTEGER;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Check helper wallet
  SELECT wallet_balance INTO _helper_balance
  FROM topup_helpers
  WHERE user_id = _user_id AND is_active = true;

  IF NOT FOUND OR _helper_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found or inactive');
  END IF;

  IF _helper_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  -- Deduct from helper wallet
  UPDATE topup_helpers
  SET wallet_balance = wallet_balance - _amount
  WHERE user_id = _user_id AND is_active = true
  RETURNING wallet_balance INTO _new_helper_balance;

  -- Add to user's diamond balance
  UPDATE profiles
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount
  WHERE id = _user_id
  RETURNING diamond_balance INTO _new_diamond_balance;

  IF _new_diamond_balance IS NULL THEN
    -- Rollback
    UPDATE topup_helpers
    SET wallet_balance = wallet_balance + _amount
    WHERE user_id = _user_id;
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  -- Log transaction
  INSERT INTO helper_transactions (helper_id, user_id, amount, transaction_type, status, notes)
  SELECT id, _user_id, _amount, 'self_withdraw', 'completed', 'Helper self diamond withdrawal'
  FROM topup_helpers WHERE user_id = _user_id LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'new_helper_balance', _new_helper_balance,
    'new_diamond_balance', _new_diamond_balance
  );
END;
$$;
