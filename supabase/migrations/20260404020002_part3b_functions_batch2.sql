CREATE OR REPLACE FUNCTION public.update_host_call_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_is_host BOOLEAN;
  _beans_earned NUMERIC;
BEGIN
  IF NEW.status IN ('ended', 'completed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT is_host INTO _host_is_host
    FROM public.profiles
    WHERE id = NEW.host_id;

    IF _host_is_host = true THEN
      _beans_earned := COALESCE(NEW.host_earned, 0);
      IF _beans_earned > 0 THEN
        UPDATE public.profiles
        SET pending_earnings = COALESCE(pending_earnings, 0) + _beans_earned,
            updated_at = now()
        WHERE id = NEW.host_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_level_on_earnings()
RETURNS TRIGGER AS $$
DECLARE
  _new_level INT;
  _points NUMERIC;
BEGIN
  -- Determine level type based on gender and host status
  IF NEW.is_host = true AND NEW.gender = 'female' THEN
    -- Female hosts: Level based on earnings
    _points := COALESCE(NEW.total_earnings, 0);
  ELSE
    -- Regular users (BOYS): Level based on RECHARGE ONLY
    _points := COALESCE(NEW.total_recharged, 0);
  END IF;
  
  -- Calculate new level
  IF NEW.is_host = true AND NEW.gender = 'female' THEN
    -- Host level thresholds
    _new_level := CASE
      WHEN _points >= 150000000 THEN 10
      WHEN _points >= 50000000 THEN 9
      WHEN _points >= 15000000 THEN 8
      WHEN _points >= 5000000 THEN 7
      WHEN _points >= 1500000 THEN 6
      WHEN _points >= 500000 THEN 5
      WHEN _points >= 150000 THEN 4
      WHEN _points >= 50000 THEN 3
      WHEN _points >= 15000 THEN 2
      WHEN _points >= 5000 THEN 1
      ELSE 0
    END;
    -- Update host_level for female hosts
    NEW.host_level := _new_level;
  ELSE
    -- User level thresholds (based on recharge)
    _new_level := CASE
      WHEN _points >= 30000000000 THEN 50
      WHEN _points >= 10000000000 THEN 40
      WHEN _points >= 3000000000 THEN 30
      WHEN _points >= 1000000000 THEN 20
      WHEN _points >= 300000000 THEN 10
      WHEN _points >= 100000000 THEN 9
      WHEN _points >= 30000000 THEN 8
      WHEN _points >= 10000000 THEN 7
      WHEN _points >= 3000000 THEN 6
      WHEN _points >= 1000000 THEN 5
      WHEN _points >= 300000 THEN 4
      WHEN _points >= 100000 THEN 3
      WHEN _points >= 30000 THEN 2
      WHEN _points >= 10000 THEN 1
      ELSE 0
    END;
  END IF;
  
  -- Update level if changed
  NEW.user_level := _new_level;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.recalculate_user_level(_user_id uuid)
RETURNS INTEGER AS $$
DECLARE
  _user_profile RECORD;
  _new_level INTEGER;
  _points BIGINT;
BEGIN
  -- Get user profile
  SELECT * INTO _user_profile FROM profiles WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Determine points based on user type
  IF _user_profile.is_host = true AND _user_profile.gender = 'female' THEN
    -- Female hosts: Level based on earnings (gifts received)
    _points := COALESCE(_user_profile.total_earnings, 0);
    _new_level := CASE
      WHEN _points >= 150000000 THEN 10
      WHEN _points >= 50000000 THEN 9
      WHEN _points >= 15000000 THEN 8
      WHEN _points >= 5000000 THEN 7
      WHEN _points >= 1500000 THEN 6
      WHEN _points >= 500000 THEN 5
      WHEN _points >= 150000 THEN 4
      WHEN _points >= 50000 THEN 3
      WHEN _points >= 15000 THEN 2
      WHEN _points >= 5000 THEN 1
      ELSE 0
    END;
  ELSE
    -- REGULAR USERS (BOYS/MEN): Level ONLY based on DIAMOND RECHARGE
    -- NOT based on gifts sent or consumption!
    _points := COALESCE(_user_profile.total_recharged, 0);
    _new_level := CASE
      WHEN _points >= 30000000000 THEN 50
      WHEN _points >= 10000000000 THEN 40
      WHEN _points >= 3000000000 THEN 30
      WHEN _points >= 1000000000 THEN 20
      WHEN _points >= 300000000 THEN 10
      WHEN _points >= 100000000 THEN 9
      WHEN _points >= 30000000 THEN 8
      WHEN _points >= 10000000 THEN 7
      WHEN _points >= 3000000 THEN 6
      WHEN _points >= 1000000 THEN 5
      WHEN _points >= 300000 THEN 4
      WHEN _points >= 100000 THEN 3
      WHEN _points >= 30000 THEN 2
      WHEN _points >= 10000 THEN 1
      ELSE 0
    END;
  END IF;
  
  -- Update user level
  UPDATE profiles SET user_level = _new_level WHERE id = _user_id;
  
  RETURN _new_level;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_host_level_on_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _receiver_profile RECORD;
  _new_level INTEGER;
BEGIN
  -- Get receiver profile
  SELECT * INTO _receiver_profile FROM profiles WHERE id = NEW.receiver_id;
  
  -- Only update level for female hosts
  IF _receiver_profile.is_host = true AND _receiver_profile.gender = 'female' THEN
    -- Calculate new level based on updated earnings
    SELECT 
      CASE
        WHEN _receiver_profile.total_earnings >= 150000000 THEN 10
        WHEN _receiver_profile.total_earnings >= 50000000 THEN 9
        WHEN _receiver_profile.total_earnings >= 15000000 THEN 8
        WHEN _receiver_profile.total_earnings >= 5000000 THEN 7
        WHEN _receiver_profile.total_earnings >= 1500000 THEN 6
        WHEN _receiver_profile.total_earnings >= 500000 THEN 5
        WHEN _receiver_profile.total_earnings >= 150000 THEN 4
        WHEN _receiver_profile.total_earnings >= 50000 THEN 3
        WHEN _receiver_profile.total_earnings >= 15000 THEN 2
        WHEN _receiver_profile.total_earnings >= 5000 THEN 1
        ELSE 0
      END INTO _new_level;
    
    -- Update host level if changed
    IF COALESCE(_receiver_profile.user_level, 0) <> _new_level THEN
      UPDATE profiles SET user_level = _new_level WHERE id = NEW.receiver_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_credit_beans(
  _log_id UUID,
  _notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _log_record RECORD;
  _receiver_profile RECORD;
  _new_pending BIGINT;
  _new_earnings BIGINT;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Get log record
  SELECT * INTO _log_record FROM gift_transaction_logs WHERE id = _log_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Log not found');
  END IF;
  
  IF _log_record.status = 'completed' THEN
    RETURN json_build_object('success', false, 'error', 'Already credited');
  END IF;
  
  -- Get receiver profile
  SELECT * INTO _receiver_profile FROM profiles WHERE id = _log_record.receiver_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Receiver not found');
  END IF;
  
  -- Calculate new amounts
  _new_pending := COALESCE(_receiver_profile.pending_earnings, 0) + _log_record.beans_amount;
  _new_earnings := COALESCE(_receiver_profile.total_earnings, 0) + _log_record.beans_amount;
  
  -- Update receiver's beans
  UPDATE profiles
  SET 
    pending_earnings = _new_pending,
    total_earnings = _new_earnings
  WHERE id = _log_record.receiver_id;
  
  -- Update log status
  UPDATE gift_transaction_logs
  SET 
    status = 'manual_credit',
    credited_at = now(),
    credited_by = auth.uid(),
    notes = COALESCE(_notes, 'Manually credited by admin'),
    updated_at = now()
  WHERE id = _log_id;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'manual_credit_beans',
    'gift_transaction_logs',
    _log_id::text,
    jsonb_build_object(
      'receiver_id', _log_record.receiver_id,
      'beans_amount', _log_record.beans_amount,
      'previous_pending', _receiver_profile.pending_earnings,
      'new_pending', _new_pending,
      'notes', _notes
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'beans_credited', _log_record.beans_amount,
    'new_pending', _new_pending,
    'new_earnings', _new_earnings
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_verify_gift_transactions()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pending_count INTEGER := 0;
  _fixed_count INTEGER := 0;
  _log_record RECORD;
  _receiver_profile RECORD;
BEGIN
  -- Loop through all pending transactions
  FOR _log_record IN 
    SELECT * FROM gift_transaction_logs 
    WHERE status = 'pending' 
    AND created_at > now() - interval '7 days'
    ORDER BY created_at ASC
    LIMIT 100
  LOOP
    _pending_count := _pending_count + 1;
    
    -- Get receiver profile
    SELECT * INTO _receiver_profile FROM profiles WHERE id = _log_record.receiver_id;
    
    IF FOUND THEN
      -- Check if this transaction was actually credited
      -- If receiver's total_earnings matches expected, mark as completed
      -- Otherwise, credit the beans
      
      -- For safety, we'll just mark old pending ones as needing review
      IF _log_record.created_at < now() - interval '1 hour' THEN
        UPDATE gift_transaction_logs
        SET 
          status = 'needs_review',
          notes = 'Auto-flagged for manual review after 1 hour',
          updated_at = now()
        WHERE id = _log_record.id;
        
        _fixed_count := _fixed_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  RETURN json_build_object(
    'pending_checked', _pending_count,
    'flagged_for_review', _fixed_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_payroll_to_trader(
  _request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trader_id uuid;
  _request record;
BEGIN
  -- Get the request
  SELECT * INTO _request FROM payroll_requests WHERE id = _request_id AND status = 'pending';
  
  IF _request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or already assigned');
  END IF;
  
  -- Find a random Level 5 trader with payroll enabled
  SELECT id INTO _trader_id
  FROM topup_helpers
  WHERE trader_level = 5 
    AND payroll_enabled = true 
    AND is_verified = true
  ORDER BY RANDOM()
  LIMIT 1;
  
  IF _trader_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No Level 5 traders available');
  END IF;
  
  -- Assign the request
  UPDATE payroll_requests 
  SET trader_id = _trader_id, 
      status = 'assigned',
      assigned_at = now(),
      updated_at = now()
  WHERE id = _request_id;
  
  RETURN jsonb_build_object('success', true, 'trader_id', _trader_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.distribute_payroll_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trader record;
  _min_count integer;
BEGIN
  -- Find the Level 5 trader with fewest pending requests
  SELECT th.id, COUNT(pr.id) as request_count
  INTO _trader
  FROM topup_helpers th
  LEFT JOIN payroll_requests pr ON pr.trader_id = th.id AND pr.status IN ('assigned', 'processing')
  WHERE th.trader_level = 5 
    AND th.payroll_enabled = true 
    AND th.is_verified = true
  GROUP BY th.id
  ORDER BY request_count ASC
  LIMIT 1;
  
  IF _trader IS NOT NULL THEN
    NEW.trader_id := _trader.id;
    NEW.status := 'assigned';
    NEW.assigned_at := now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-assign payroll requests
DROP TRIGGER IF EXISTS auto_assign_payroll ON payroll_requests;
CREATE TRIGGER auto_assign_payroll
  BEFORE INSERT ON payroll_requests
  FOR EACH ROW
  EXECUTE FUNCTION distribute_payroll_requests();"}		rjboss923@gmail.com	\N	\N
20260302051200	{"DROP FUNCTION IF EXISTS public.approve_rating_reward(uuid, text);"}		rjboss923@gmail.com	\N	\N
20260115094351	{"-- Enable REPLICA IDENTITY FULL for real-time updates on key tables
ALTER TABLE recharge_transactions REPLICA IDENTITY FULL;
ALTER TABLE payment_transactions REPLICA IDENTITY FULL;
ALTER TABLE helper_transactions REPLICA IDENTITY FULL;
ALTER TABLE agency_diamond_transactions REPLICA IDENTITY FULL;
ALTER TABLE helper_orders REPLICA IDENTITY FULL;
ALTER TABLE agencies REPLICA IDENTITY FULL;
ALTER TABLE agency_hosts REPLICA IDENTITY FULL;
ALTER TABLE gift_transaction_logs REPLICA IDENTITY FULL;
ALTER TABLE banners REPLICA IDENTITY FULL;
ALTER TABLE avatar_frames REPLICA IDENTITY FULL;
ALTER TABLE gifts REPLICA IDENTITY FULL;
ALTER TABLE coin_packages REPLICA IDENTITY FULL;
ALTER TABLE topup_helpers REPLICA IDENTITY FULL;
ALTER TABLE agency_withdrawals REPLICA IDENTITY FULL;

-- Add tables to realtime publication (only new ones, skip if already exists)
DO $$
BEGIN
  -- Try to add each table, ignore if already exists
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE recharge_transactions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE payment_transactions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE helper_transactions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE agency_diamond_transactions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE helper_orders; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE agencies; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE agency_hosts; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE gift_transaction_logs; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE banners; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE avatar_frames; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE gifts; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE coin_packages; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE topup_helpers; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE agency_withdrawals; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- Create function to update user level when coins are added
CREATE OR REPLACE FUNCTION update_user_level_on_coin_change()
RETURNS TRIGGER AS $$
DECLARE
  user_consumption NUMERIC;
  user_earnings NUMERIC;
  is_female_host BOOLEAN;
  new_level INTEGER;
  tier_type_val TEXT;
BEGIN
  -- Get user's current consumption and earnings
  SELECT 
    COALESCE(total_consumption, 0),
    COALESCE(total_earnings, 0),
    (is_host = true AND gender = 'female')
  INTO user_consumption, user_earnings, is_female_host
  FROM profiles
  WHERE id = NEW.user_id;
  
  -- Determine tier type
  tier_type_val := CASE WHEN is_female_host THEN 'host' ELSE 'user' END;
  
  -- Find the appropriate level
  SELECT level_number INTO new_level
  FROM user_level_tiers
  WHERE tier_type = tier_type_val
    AND is_active = true
    AND (
      (tier_type_val = 'host' AND min_earning_amount <= user_earnings) OR
      (tier_type_val = 'user' AND min_topup_amount <= user_consumption)
    )
  ORDER BY level_number DESC
  LIMIT 1;
  
  -- Update user level if changed
  IF new_level IS NOT NULL THEN
    UPDATE profiles
    SET user_level = new_level
    WHERE id = NEW.user_id AND (user_level IS NULL OR user_level < new_level);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_user_level_on_change()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
  user_coins NUMERIC;
  user_earnings NUMERIC;
  is_female_host BOOLEAN;
  new_level INTEGER;
  current_level INTEGER;
BEGIN
  -- Determine target user based on trigger source
  IF TG_TABLE_NAME = 'profiles' THEN
    target_user_id := NEW.id;
    user_coins := COALESCE(NEW.coins, 0);
  ELSIF TG_TABLE_NAME = 'gift_transactions' THEN
    target_user_id := NEW.receiver_id;
  ELSIF TG_TABLE_NAME = 'payment_transactions' OR TG_TABLE_NAME = 'recharge_transactions' THEN
    target_user_id := NEW.user_id;
  ELSE
    target_user_id := COALESCE(NEW.receiver_id, NEW.user_id);
  END IF;
  
  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get user's current data
  SELECT 
    COALESCE(p.coins, 0),
    COALESCE(p.total_earnings, 0),
    (p.is_host = true AND p.gender = 'female'),
    COALESCE(p.user_level, 0)
  INTO user_coins, user_earnings, is_female_host, current_level
  FROM profiles p
  WHERE p.id = target_user_id;
  
  -- Find appropriate level
  IF is_female_host THEN
    -- For female hosts, use earnings
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_earning_amount <= user_earnings
    ORDER BY level_number DESC
    LIMIT 1;
  ELSE
    -- For regular users, use coins (total diamonds topped up)
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'user'
      AND is_active = true
      AND min_topup_amount <= user_coins
    ORDER BY level_number DESC
    LIMIT 1;
  END IF;
  
  new_level := COALESCE(new_level, 0);
  
  -- Update level if different
  IF new_level != current_level THEN
    UPDATE profiles
    SET user_level = new_level, updated_at = now()
    WHERE id = target_user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.email_otps 
  WHERE expires_at < now() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_update_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    _user_id := NEW.id;
    PERFORM public.recalculate_single_user_level(_user_id);
  ELSIF TG_TABLE_NAME = 'gift_transactions' THEN
    -- ONLY update RECEIVER (host) level on gift, NOT sender
    -- User level should only change via recharge
    _user_id := NEW.receiver_id;
    PERFORM public.recalculate_single_user_level(_user_id);
  ELSIF TG_TABLE_NAME = 'coin_transfers' THEN
    _user_id := NEW.receiver_id;
    PERFORM public.recalculate_single_user_level(_user_id);
  ELSE
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_single_user_level(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _profile record;
  _new_user_level integer := 0;
  _new_host_level integer := 0;
  _current_user_level integer := 0;
  _max_user_level integer := 0;
  _user_recharge_total numeric;
BEGIN
  -- Get current profile data
  SELECT * INTO _profile FROM profiles WHERE id = _user_id;
  
  IF _profile IS NULL THEN
    RETURN;
  END IF;

  -- Get current and max user level (we will never decrease below max)
  _current_user_level := COALESCE(_profile.user_level, 0);
  _max_user_level := GREATEST(COALESCE(_profile.max_user_level, 0), _current_user_level);
  
  -- USER LEVEL ONLY based on total_recharged (NOT gifts, NOT consumption)
  _user_recharge_total := COALESCE(_profile.total_recharged, 0);
  
  SELECT COALESCE(level_number, 0) INTO _new_user_level
  FROM user_level_tiers
  WHERE tier_type = 'user'
    AND is_active = true
    AND min_topup_amount <= _user_recharge_total
  ORDER BY level_number DESC
  LIMIT 1;

  _new_user_level := COALESCE(_new_user_level, 0);
  
  -- USER LEVEL NEVER DECREASES
  _new_user_level := GREATEST(_new_user_level, _current_user_level, _max_user_level);
  _max_user_level := GREATEST(_new_user_level, _max_user_level);
  
  -- For hosts, calculate level based on WEEKLY earnings (this CAN reset)
  IF _profile.is_host = true THEN
    SELECT COALESCE(level_number, 0) INTO _new_host_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_earning_amount <= COALESCE(_profile.weekly_earnings, 0)
    ORDER BY level_number DESC
    LIMIT 1;
    
    _new_host_level := COALESCE(_new_host_level, 0);
  END IF;

  -- Update profile
  UPDATE profiles
  SET 
    user_level = _new_user_level,
    max_user_level = _max_user_level,
    host_level = _new_host_level
  WHERE id = _user_id;
  
END;
$function$;

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
  SELECT * INTO _call_record FROM private_calls WHERE id = p_call_id FOR UPDATE;
  
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
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
      SET host_earned = COALESCE(host_earned, 0) + _first_minute_host_beans,
          host_earnings_amount = COALESCE(host_earnings_amount, 0) + _first_minute_host_beans
      WHERE id = p_call_id;
    END IF;
    
    UPDATE private_calls 
    SET status = 'ended', ended_at = now(), end_reason = 'insufficient_coins'
    WHERE id = p_call_id;
    
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'caller_balance', _caller_balance, 'required', _coins_to_deduct, 'call_ended', true);
  END IF;
  
  -- Deduct from caller
  UPDATE profiles 
  SET coins = coins - _coins_to_deduct, updated_at = now()
  WHERE id = _call_record.caller_id;
  
  -- Add beans to host
  IF _host_beans > 0 THEN
    UPDATE profiles 
    SET beans = COALESCE(beans, 0) + _host_beans,
        weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
        total_earnings = COALESCE(total_earnings, 0) + _host_beans,
        updated_at = now()
    WHERE id = _call_record.host_id;
  END IF;
  
  -- FIX: Update BOTH host_earned AND host_earnings_amount so leaderboard/agency queries work
  UPDATE private_calls
  SET 
    coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
    total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
    host_earned = COALESCE(host_earned, 0) + _host_beans,
    host_earnings_amount = COALESCE(host_earnings_amount, 0) + _host_beans,
    duration_seconds = COALESCE(duration_seconds, 0) + 60,
    last_billing_at = now()
  WHERE id = p_call_id;
  
  RETURN jsonb_build_object('success', true, 'coins_deducted', _coins_to_deduct, 'host_earned', _host_beans, 'commission_percent', _host_commission_percent, 'caller_remaining', _caller_balance - _coins_to_deduct, 'call_duration', _call_duration_seconds + 60, 'is_first_minute', _is_first_minute, 'is_second_minute', _is_second_minute, 'grace_period_seconds', _grace_period_seconds);
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_phone_number_violation(
  _user_id UUID,
  _detected_content TEXT,
  _context_type TEXT DEFAULT 'call'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _violation_count INTEGER;
  _auto_ban_threshold INTEGER;
  _action_taken TEXT;
BEGIN
  -- Get auto-ban threshold from settings
  SELECT COALESCE((setting_value)::INTEGER, 3) INTO _auto_ban_threshold
  FROM app_settings
  WHERE setting_key = 'auto_ban_phone_threshold';
  
  IF _auto_ban_threshold IS NULL THEN
    _auto_ban_threshold := 3;
  END IF;
  
  -- Get current violation count
  SELECT COALESCE(phone_violation_count, 0) + 1 INTO _violation_count
  FROM profiles WHERE id = _user_id;
  
  -- Update violation count
  UPDATE profiles
  SET phone_violation_count = _violation_count
  WHERE id = _user_id;
  
  -- Determine action
  IF _violation_count >= _auto_ban_threshold THEN
    _action_taken := 'auto_ban';
    -- Ban the user
    UPDATE profiles
    SET 
      is_blocked = true,
      blocked_at = now(),
      blocked_reason = 'Auto-banned for sharing phone number ' || _violation_count || ' times'
    WHERE id = _user_id;
  ELSE
    _action_taken := 'warning';
  END IF;
  
  -- Log the violation
  INSERT INTO chat_moderation_logs (
    user_id,
    violation_type,
    detected_content,
    action_taken,
    is_auto_action,
    notes
  ) VALUES (
    _user_id,
    'phone_number_' || _context_type,
    _detected_content,
    _action_taken,
    true,
    'Detected during ' || _context_type || '. Violation #' || _violation_count
  );
  
  RETURN jsonb_build_object(
    'violation_count', _violation_count,
    'action_taken', _action_taken,
    'is_banned', _violation_count >= _auto_ban_threshold
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.manual_credit_call_earnings(
  _call_id UUID,
  _admin_id UUID,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call RECORD;
  v_host_commission_rate NUMERIC;
  v_host_earnings INTEGER;
BEGIN
  -- Verify admin identity
  IF auth.uid() IS NOT NULL AND (auth.uid() != _admin_id OR NOT public.is_admin(auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_call FROM private_calls WHERE id = _call_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found');
  END IF;
  
  IF v_call.host_earnings_credited THEN
    RETURN jsonb_build_object('success', false, 'error', 'Earnings already credited');
  END IF;
  
  IF v_call.coins_spent IS NULL OR v_call.coins_spent = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No coins spent on this call');
  END IF;
  
  SELECT COALESCE((setting_value->>'host_commission_percent')::NUMERIC, 50) / 100
  INTO v_host_commission_rate
  FROM app_settings WHERE setting_key = 'call_rates';
  
  v_host_earnings := FLOOR(v_call.coins_spent * v_host_commission_rate);
  
  UPDATE profiles
  SET pending_earnings = COALESCE(pending_earnings, 0) + v_host_earnings,
      total_earnings = COALESCE(total_earnings, 0) + v_host_earnings,
      -- CRITICAL FIX: Also add to weekly_earnings so host level increases
      weekly_earnings = COALESCE(weekly_earnings, 0) + v_host_earnings
  WHERE id = v_call.host_id;
  
  UPDATE private_calls
  SET host_earnings_credited = TRUE,
      host_earnings_amount = v_host_earnings,
      host_earnings_credited_at = NOW(),
      host_earnings_credited_by = _admin_id,
      admin_notes = _notes
  WHERE id = _call_id;
  
  RETURN jsonb_build_object(
    'success', true, 'host_id', v_call.host_id,
    'earnings_credited', v_host_earnings, 'call_id', _call_id
  );
END;
$$;

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

CREATE OR REPLACE FUNCTION public.approve_host_request(
  _agency_id UUID,
  _host_id UUID,
  _approver_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_owner_id UUID;
  _agency_name TEXT;
  _referral_code_used TEXT;
BEGIN
  SELECT owner_id, name INTO _agency_owner_id, _agency_name
  FROM public.agencies
  WHERE id = _agency_id;
  
  IF _agency_owner_id != _approver_id THEN
    RETURN FALSE;
  END IF;
  
  -- Get the referral code before updating
  SELECT referral_code INTO _referral_code_used
  FROM public.agency_hosts
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';

  UPDATE public.agency_hosts
  SET status = 'active', joined_at = now()
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  UPDATE public.profiles
  SET agency_id = _agency_id
  WHERE id = _host_id;
  
  UPDATE public.agencies
  SET total_hosts = COALESCE(total_hosts, 0) + 1
  WHERE id = _agency_id;

  -- Increment sub-agent's total_referrals if host joined via sub-agent link
  IF _referral_code_used IS NOT NULL AND _referral_code_used != '' THEN
    UPDATE public.sub_agents
    SET total_referrals = COALESCE(total_referrals, 0) + 1
    WHERE referral_code = _referral_code_used
      AND agency_id = _agency_id
      AND status = 'active';
  END IF;

  -- Notify the host that they've been approved
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (
    _host_id,
    'agency_joined',
    '🎉 Agency Request Approved!',
    'You have been approved to join ' || COALESCE(_agency_name, 'the agency') || '. Welcome!',
    jsonb_build_object(
      'agency_id', _agency_id,
      'agency_name', _agency_name,
      'action_url', '/agency'
    ),
    false
  );
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_host_request(
  _agency_id UUID,
  _host_id UUID,
  _rejector_id UUID,
  _rejection_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_owner_id UUID;
  _agency_name TEXT;
BEGIN
  SELECT owner_id, name INTO _agency_owner_id, _agency_name
  FROM public.agencies
  WHERE id = _agency_id;
  
  IF _agency_owner_id != _rejector_id THEN
    RETURN FALSE;
  END IF;
  
  UPDATE public.agency_hosts
  SET status = 'rejected'
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Notify the host that they've been rejected
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (
    _host_id,
    'host_rejected',
    '❌ Agency Request Rejected',
    'Your request to join ' || COALESCE(_agency_name, 'the agency') || ' was not approved.' || 
      CASE WHEN _rejection_reason IS NOT NULL THEN ' Reason: ' || _rejection_reason ELSE '' END,
    jsonb_build_object(
      'agency_id', _agency_id,
      'agency_name', _agency_name,
      'rejection_reason', _rejection_reason,
      'action_url', '/join-agency'
    ),
    false
  );
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_host_agency_request(_host_id UUID)
RETURNS TABLE (
  agency_id UUID,
  agency_name TEXT,
  agency_code TEXT,
  agency_level TEXT,
  agency_logo_url TEXT,
  status TEXT,
  requested_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as agency_id,
    a.name as agency_name,
    a.agency_code,
    a.level as agency_level,
    a.logo_url as agency_logo_url,
    ah.status,
    ah.joined_at as requested_at
  FROM public.agency_hosts ah
  JOIN public.agencies a ON a.id = ah.agency_id
  WHERE ah.host_id = _host_id
  ORDER BY ah.joined_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_ranking_metrics()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.reset_host_levels_weekly()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Save current host_level as previous_host_level, then reset
  UPDATE profiles
  SET 
    previous_host_level = COALESCE(host_level, 0),
    host_level = 0,
    weekly_earnings = 0,
    weekly_reset_at = now()
  WHERE 
    is_host = true
    AND weekly_reset_at < (now() - interval '7 days');
    
  RAISE NOTICE 'Weekly host level reset completed at %. Previous levels saved.', now();
END;
$$;

CREATE OR REPLACE FUNCTION public.add_to_weekly_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _receiver_is_host boolean;
  _beans_amount numeric;
  _host_percent numeric;
BEGIN
  SELECT is_host INTO _receiver_is_host FROM profiles WHERE id = NEW.receiver_id;
  IF _receiver_is_host = true THEN
    _host_percent := public.get_effective_host_percent();
    _beans_amount := FLOOR(NEW.coin_amount * _host_percent / 100);
    UPDATE profiles SET weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount WHERE id = NEW.receiver_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.game_cashout(p_user_id UUID, p_bet_id UUID, p_win_amount INTEGER, p_multiplier NUMERIC)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_coins INTEGER;
  v_new_coins INTEGER;
  v_result JSON;
  v_bet_record RECORD;
BEGIN
  -- CRITICAL: User can only cashout for themselves
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT coins INTO v_current_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_coins IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT lgb.*, lgr.game_id INTO v_bet_record
  FROM live_game_bets lgb
  JOIN live_game_rounds lgr ON lgb.round_id = lgr.id
  WHERE lgb.id = p_bet_id AND lgb.user_id = p_user_id;

  IF v_bet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Bet not found');
  END IF;
  IF v_bet_record.is_processed THEN
    RETURN json_build_object('success', false, 'error', 'Bet already processed');
  END IF;

  v_new_coins := v_current_coins + p_win_amount;
  UPDATE profiles SET coins = v_new_coins WHERE id = p_user_id;
  UPDATE live_game_bets SET is_winner = true, win_amount = p_win_amount, multiplier = p_multiplier, is_processed = true, cashed_out_at = now()
  WHERE id = p_bet_id AND user_id = p_user_id;

  INSERT INTO game_bets (game_id, user_id, bet_amount, bet_type, is_winner, win_amount, multiplier, result)
  VALUES (v_bet_record.game_id, p_user_id, v_bet_record.bet_amount, 'cashout', true, p_win_amount, p_multiplier,
    jsonb_build_object('type', 'cashout', 'multiplier', p_multiplier, 'win_amount', p_win_amount));

  RETURN json_build_object('success', true, 'new_balance', v_new_coins, 'win_amount', p_win_amount, 'multiplier', p_multiplier);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_helper_trader_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_level integer := 1;
BEGIN
  -- Find the highest level the helper qualifies for (max level 4 for auto-upgrade)
  SELECT COALESCE(MAX(level_number), 1) INTO _new_level
  FROM trader_level_tiers
  WHERE is_active = true
    AND upgrade_cost_usd <= COALESCE(NEW.total_level_upgrade_cost, 0)
    AND level_number <= 4;  -- Level 5 requires manual application
  
  -- Only upgrade, never downgrade (level can only increase)
  IF _new_level > COALESCE(NEW.trader_level, 1) THEN
    NEW.trader_level := _new_level;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  VALUES (p_user_id, p_type, p_title, p_message, p_data, false)
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_topup_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'completed' OR NEW.status = 'approved' THEN
      -- Notify user about approved top-up
      PERFORM public.create_notification(
        NEW.user_id,
        'topup_approved',
        'Top-up Approved! 💎',
        'Your top-up of ' || NEW.coin_amount::text || ' coins has been approved.',
        jsonb_build_object('amount', NEW.coin_amount, 'payment_method', NEW.payment_method)
      );
    ELSIF NEW.status = 'rejected' THEN
      -- Notify user about rejected top-up
      PERFORM public.create_notification(
        NEW.user_id,
        'topup_rejected',
        'Top-up Rejected',
        'Your top-up request has been rejected. Please contact support for more information.',
        jsonb_build_object('amount', NEW.coin_amount, 'reason', NEW.admin_notes)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_agency_withdrawal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agency_owner_id uuid;
BEGIN
  -- Get agency owner
  SELECT owner_id INTO agency_owner_id FROM public.agencies WHERE id = NEW.agency_id;
  
  IF OLD.status IS DISTINCT FROM NEW.status AND agency_owner_id IS NOT NULL THEN
    IF NEW.status = 'completed' OR NEW.status = 'approved' THEN
      PERFORM public.create_notification(
        agency_owner_id,
        'withdrawal_approved',
        'Withdrawal Approved! ✅',
        'Your withdrawal of $' || NEW.amount::text || ' has been approved and processed.',
        jsonb_build_object('amount', NEW.amount, 'payment_method', NEW.payment_method)
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.create_notification(
        agency_owner_id,
        'withdrawal_rejected',
        'Withdrawal Rejected',
        'Your withdrawal request has been rejected. Reason: ' || COALESCE(NEW.notes, 'Not specified'),
        jsonb_build_object('amount', NEW.amount, 'reason', NEW.notes)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_coin_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Notify receiver about received coins
  IF NEW.sender_type = 'trader_to_user' OR NEW.sender_type = 'trader_to_agency' THEN
    PERFORM public.create_notification(
      NEW.receiver_id,
      'coins_received',
      'Coins Received! 💎',
      'You have received ' || NEW.amount::text || ' diamonds.',
      jsonb_build_object('amount', NEW.amount, 'sender_id', NEW.sender_id, 'transfer_type', NEW.sender_type)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_diamond_exchange()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agency_owner_id uuid;
BEGIN
  -- Get agency owner
  SELECT owner_id INTO agency_owner_id FROM public.agencies WHERE id = NEW.agency_id;
  
  IF agency_owner_id IS NOT NULL THEN
    IF NEW.transaction_type = 'exchange' THEN
      PERFORM public.create_notification(
        agency_owner_id,
        'coin_exchange',
        'Exchange Successful! ✨',
        'Converted ' || NEW.beans_amount::text || ' beans to ' || NEW.diamond_amount::text || ' diamonds.',
        jsonb_build_object('beans', NEW.beans_amount, 'diamonds', NEW.diamond_amount, 'fee', NEW.fee_amount)
      );
    ELSIF NEW.transaction_type = 'send' AND NEW.user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        agency_owner_id,
        'diamond_sent',
        'Diamonds Sent! 💎',
        'Successfully sent ' || NEW.diamond_amount::text || ' diamonds.',
        jsonb_build_object('amount', NEW.diamond_amount, 'receiver_id', NEW.user_id)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_helper_level_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.create_notification(
        NEW.user_id,
        'level_upgrade_approved',
        'Level Upgrade Approved! 🎉',
        'Your upgrade to Level ' || NEW.requested_level::text || ' has been approved.',
        jsonb_build_object('level', NEW.requested_level)
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.create_notification(
        NEW.user_id,
        'level_upgrade_rejected',
        'Level Upgrade Rejected',
        'Your level upgrade request has been rejected. ' || COALESCE(NEW.admin_notes, ''),
        jsonb_build_object('level', NEW.requested_level, 'reason', NEW.admin_notes)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_agency_id UUID;
  _agency_level TEXT;
  _agency_commission_rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
  _host_percent NUMERIC;
BEGIN
  SELECT ah.agency_id INTO _host_agency_id FROM agency_hosts ah WHERE ah.host_id = NEW.receiver_id AND ah.status = 'active' LIMIT 1;
  IF _host_agency_id IS NULL THEN RETURN NEW; END IF;

  _host_percent := public.get_effective_host_percent();
  _host_earnings := FLOOR(NEW.coin_amount * _host_percent / 100);

  SELECT a.level INTO _agency_level FROM agencies a WHERE a.id = _host_agency_id;
  SELECT COALESCE(alt.commission_rate, 3) INTO _agency_commission_rate FROM agency_level_tiers alt WHERE alt.level_code = COALESCE(_agency_level, 'A1') AND alt.is_active = true;
  _commission_amount := FLOOR(_host_earnings * COALESCE(_agency_commission_rate, 3) / 100);

  IF _commission_amount > 0 THEN
    UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount WHERE id = _host_agency_id;
    INSERT INTO agency_commission_history (agency_id, host_id, transaction_type, original_amount, commission_rate, commission_amount, source_transaction_id, notes)
    VALUES (_host_agency_id, NEW.receiver_id, 'gift', _host_earnings, COALESCE(_agency_commission_rate, 3), _commission_amount, NEW.id,
      'Gift: ' || NEW.coin_amount || ' coins → Host ' || _host_percent || '% = ' || _host_earnings || ' → Agency ' || COALESCE(_agency_commission_rate, 3) || '% = ' || _commission_amount);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission_from_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_agency_id UUID;
  _agency_level TEXT;
  _agency_commission_rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
BEGIN
  IF NEW.status NOT IN ('ended', 'completed') OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT ah.agency_id INTO _host_agency_id
  FROM agency_hosts ah
  WHERE ah.host_id = NEW.host_id
    AND ah.status = 'active'
  LIMIT 1;

  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  _host_earnings := COALESCE(NEW.host_earned, FLOOR(COALESCE(NEW.coins_spent, 0) * public.get_call_host_commission_percent() / 100));

  SELECT a.level INTO _agency_level
  FROM agencies a
  WHERE a.id = _host_agency_id;

  SELECT COALESCE(alt.commission_rate, 3) INTO _agency_commission_rate
  FROM agency_level_tiers alt
  WHERE alt.level_code = COALESCE(_agency_level, 'A1')
    AND alt.is_active = true;

  _commission_amount := FLOOR(_host_earnings * COALESCE(_agency_commission_rate, 3) / 100);

  IF _commission_amount > 0 THEN
    UPDATE agencies
    SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
    WHERE id = _host_agency_id;

    INSERT INTO agency_commission_history (
      agency_id, host_id, transaction_type, original_amount,
      commission_rate, commission_amount, source_transaction_id, notes
    ) VALUES (
      _host_agency_id, NEW.host_id, 'call', _host_earnings,
      COALESCE(_agency_commission_rate, 3), _commission_amount, NEW.id,
      'Auto commission from call'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_user_live_banned(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.live_bans
    WHERE user_id = p_user_id
    AND is_active = true
    AND (ban_end IS NULL OR ban_end > now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_live_ban(p_user_id UUID)
RETURNS TABLE (
  ban_id UUID,
  ban_reason TEXT,
  ban_end TIMESTAMP WITH TIME ZONE,
  remaining_hours INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lb.id,
    lb.ban_reason,
    lb.ban_end,
    CASE 
      WHEN lb.ban_end IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (lb.ban_end - now()))::INTEGER / 3600
    END
  FROM public.live_bans lb
  WHERE lb.user_id = p_user_id
  AND lb.is_active = true
  AND (lb.ban_end IS NULL OR lb.ban_end > now())
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_live_violation(
  p_user_id UUID,
  p_stream_id UUID,
  p_violation_type TEXT,
  p_auto_detected BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warning_count INTEGER;
  v_max_warnings INTEGER;
  v_auto_ban_hours INTEGER;
  v_result JSONB;
BEGIN
  -- Get max warnings setting
  SELECT (setting_value->>'count')::INTEGER INTO v_max_warnings
  FROM public.live_moderation_settings
  WHERE setting_key = 'max_warnings_before_ban';
  
  IF v_max_warnings IS NULL THEN v_max_warnings := 3; END IF;
  
  -- Get auto ban duration
  SELECT (setting_value->>'hours')::INTEGER INTO v_auto_ban_hours
  FROM public.live_moderation_settings
  WHERE setting_key = 'auto_ban_duration_hours';
  
  IF v_auto_ban_hours IS NULL THEN v_auto_ban_hours := 24; END IF;
  
  -- Count existing violations today
  SELECT COUNT(*) INTO v_warning_count
  FROM public.live_violations
  WHERE user_id = p_user_id
  AND created_at > now() - INTERVAL '24 hours';
  
  v_warning_count := v_warning_count + 1;
  
  -- Record violation
  INSERT INTO public.live_violations (user_id, stream_id, violation_type, warning_number, auto_detected)
  VALUES (p_user_id, p_stream_id, p_violation_type, v_warning_count, p_auto_detected);
  
  -- Check if ban needed
  IF v_warning_count >= v_max_warnings THEN
    -- Create ban
    INSERT INTO public.live_bans (user_id, ban_reason, violation_type, warning_count, ban_duration_hours, ban_end, auto_banned)
    VALUES (
      p_user_id, 
      'Auto-banned after ' || v_max_warnings || ' violations for ' || p_violation_type,
      p_violation_type,
      v_warning_count,
      v_auto_ban_hours,
      now() + (v_auto_ban_hours || ' hours')::INTERVAL,
      true
    );
    
    v_result := jsonb_build_object(
      'action', 'banned',
      'warning_count', v_warning_count,
      'ban_hours', v_auto_ban_hours
    );
  ELSE
    v_result := jsonb_build_object(
      'action', 'warning',
      'warning_count', v_warning_count,
      'warnings_remaining', v_max_warnings - v_warning_count
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- Create indexes for performance
CREATE INDEX idx_live_bans_user_active ON public.live_bans(user_id, is_active);
CREATE INDEX idx_live_bans_ban_end ON public.live_bans(ban_end) WHERE is_active = true;
CREATE INDEX idx_live_violations_user ON public.live_violations(user_id, created_at);"}		rjboss923@gmail.com	\N	\N
20260122090603	{"-- Create a function to clean up stale party room participants
-- and mark rooms as inactive when all participants leave
CREATE OR REPLACE FUNCTION cleanup_stale_party_participants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark participants who joined more than 2 hours ago and haven't left as \\"left\\"
  UPDATE party_room_participants
  SET left_at = NOW()
  WHERE left_at IS NULL
    AND joined_at < NOW() - INTERVAL '2 hours';

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

CREATE OR REPLACE FUNCTION public.cancel_account_deletion(user_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() != user_id_param AND NOT public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles
  SET deletion_requested_at = NULL, deletion_scheduled_at = NULL
  WHERE id = user_id_param;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_account_deletion(user_id_param UUID)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
  scheduled_date TIMESTAMP WITH TIME ZONE;
BEGIN
  scheduled_date := now() + INTERVAL '15 days';
  
  UPDATE public.profiles
  SET 
    deletion_requested_at = now(),
    deletion_scheduled_at = scheduled_date
  WHERE id = user_id_param;
  
  RETURN scheduled_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.find_account_by_face(face_hash_param TEXT)
RETURNS TABLE(
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  is_deleted BOOLEAN,
  deletion_scheduled_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.display_name,
    p.avatar_url,
    p.is_deleted,
    p.deletion_scheduled_at
  FROM public.profiles p
  WHERE p.face_hash = face_hash_param
  AND p.is_host = TRUE
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.auto_convert_account_by_gender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If gender is set to 'female', automatically convert to host account
  IF NEW.gender = 'female' THEN
    NEW.is_host := true;
    NEW.host_status := 'approved';
    NEW.is_face_verified := true;
  -- If gender is set to 'male', revert to user account
  ELSIF NEW.gender = 'male' THEN
    NEW.is_host := false;
    NEW.host_status := null;
    NEW.is_face_verified := false;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stuck_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- End calls that have been stuck for more than 10 minutes
  UPDATE private_calls 
  SET status = 'ended', ended_at = now()
  WHERE status IN ('connected', 'pending', 'ringing')
  AND started_at < now() - interval '10 minutes';
  
  -- Reset is_in_call for users not in active calls
  UPDATE profiles 
  SET is_in_call = false 
  WHERE is_in_call = true 
  AND id NOT IN (
    SELECT caller_id FROM private_calls WHERE status IN ('pending', 'connected', 'ringing')
    UNION
    SELECT host_id FROM private_calls WHERE status IN ('pending', 'connected', 'ringing')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_level_frame(
  p_level integer,
  p_target_type text DEFAULT 'user'
)
RETURNS TABLE (
  id uuid,
  name text,
  frame_url text,
  frame_type text,
  animation_type text,
  min_level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    af.id,
    af.name,
    af.frame_url,
    af.frame_type,
    af.animation_type,
    af.min_level
  FROM avatar_frames af
  WHERE af.is_active = true
    AND af.min_level <= p_level
    AND (af.target_type = p_target_type OR af.target_type = 'both')
  ORDER BY af.min_level DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_level_frame()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_frame_id uuid;
  v_level integer;
  v_target_type text;
BEGIN
  -- Check if user_level changed
  IF NEW.user_level IS DISTINCT FROM OLD.user_level THEN
    v_level := COALESCE(NEW.user_level, 1);
    v_target_type := 'user';
    
    -- Find the best matching frame for this user level
    SELECT af.id INTO v_frame_id
    FROM avatar_frames af
    WHERE af.is_active = true
      AND af.min_level <= v_level
      AND (af.target_type = 'user' OR af.target_type = 'both')
    ORDER BY af.min_level DESC
    LIMIT 1;
    
    -- Update frame_id if found
    IF v_frame_id IS NOT NULL THEN
      NEW.frame_id := v_frame_id;
    END IF;
  END IF;
  
  -- Check if host_level changed
  IF NEW.host_level IS DISTINCT FROM OLD.host_level THEN
    v_level := COALESCE(NEW.host_level, 1);
    v_target_type := 'host';
    
    -- Find the best matching frame for this host level
    SELECT af.id INTO v_frame_id
    FROM avatar_frames af
    WHERE af.is_active = true
      AND af.min_level <= v_level
      AND (af.target_type = 'host' OR af.target_type = 'both')
    ORDER BY af.min_level DESC
    LIMIT 1;
    
    -- Update equipped_frame_id for hosts
    IF v_frame_id IS NOT NULL THEN
      NEW.equipped_frame_id := v_frame_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_display_name text;
    _user_app_uid text;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    -- Get user info for logging before deletion
    SELECT display_name, app_uid INTO _user_display_name, _user_app_uid
    FROM public.profiles WHERE id = _user_id;
    
    -- Delete related records first (in order of dependencies)
    DELETE FROM public.followers WHERE follower_id = _user_id OR following_id = _user_id;
    DELETE FROM public.messages WHERE sender_id = _user_id OR receiver_id = _user_id;
    DELETE FROM public.conversations WHERE participant_1 = _user_id OR participant_2 = _user_id;
    DELETE FROM public.gift_transactions WHERE sender_id = _user_id OR receiver_id = _user_id;
    DELETE FROM public.call_events WHERE call_id IN (SELECT id FROM public.private_calls WHERE caller_id = _user_id OR receiver_id = _user_id);
    DELETE FROM public.private_calls WHERE caller_id = _user_id OR receiver_id = _user_id;
    DELETE FROM public.coin_transfers WHERE sender_id = _user_id OR receiver_id = _user_id;
    DELETE FROM public.user_task_progress WHERE user_id = _user_id;
    DELETE FROM public.game_bets WHERE user_id = _user_id;
    DELETE FROM public.game_players WHERE user_id = _user_id;
    DELETE FROM public.user_rewards WHERE user_id = _user_id;
    DELETE FROM public.reels WHERE user_id = _user_id;
    DELETE FROM public.live_streams WHERE host_id = _user_id;
    DELETE FROM public.party_room_participants WHERE user_id = _user_id;
    DELETE FROM public.agency_hosts WHERE host_id = _user_id;
    DELETE FROM public.face_verification_submissions WHERE user_id = _user_id;
    DELETE FROM public.face_records WHERE user_id = _user_id;
    DELETE FROM public.host_applications WHERE user_id = _user_id;
    DELETE FROM public.chat_moderation_logs WHERE user_id = _user_id;
    DELETE FROM public.notifications WHERE user_id = _user_id;
    DELETE FROM public.user_blacklist WHERE user_id = _user_id OR blocked_user_id = _user_id;
    DELETE FROM public.user_purchases WHERE user_id = _user_id;
    DELETE FROM public.shop_purchases WHERE user_id = _user_id;
    DELETE FROM public.recharge_requests WHERE user_id = _user_id;
    
    -- Log the deletion action
    PERFORM public.log_admin_action(
        'delete_user',
        'user',
        _user_id,
        jsonb_build_object(
            'display_name', _user_display_name,
            'app_uid', _user_app_uid,
            'deleted_at', now()
        )
    );
    
    -- Finally delete the profile (this will cascade if auth.users has proper FK)
    DELETE FROM public.profiles WHERE id = _user_id;
    
    -- Delete from auth.users using admin API (handled separately or via Supabase dashboard)
    -- Note: Full deletion from auth.users should be done via Supabase admin API
    
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_full_details(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    SELECT jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'username', p.username,
        'avatar_url', p.avatar_url,
        'app_uid', p.app_uid,
        'email', au.email,
        'phone', au.phone,
        'gender', p.gender,
        'country_name', p.country_name,
        'is_host', p.is_host,
        'is_verified', p.is_verified,
        'is_blocked', p.is_blocked,
        'blocked_at', p.blocked_at,
        'blocked_reason', p.blocked_reason,
        'is_online', p.is_online,
        'last_seen_at', p.last_seen_at,
        'user_level', p.user_level,
        'host_level', p.host_level,
        'coins', p.coins,
        'total_earnings', p.total_earnings,
        'pending_earnings', p.pending_earnings,
        'total_consumption', p.total_consumption,
        'host_status', p.host_status,
        'call_rate_per_minute', p.call_rate_per_minute,
        'created_at', p.created_at,
        'bio', p.bio,
        'agency', (
            SELECT jsonb_build_object(
                'id', a.id,
                'name', a.name,
                'agency_code', a.agency_code
            )
            FROM public.agency_hosts ah
            JOIN public.agencies a ON a.id = ah.agency_id
            WHERE ah.host_id = p.id AND ah.status = 'active'
            LIMIT 1
        ),
        'followers_count', (SELECT COUNT(*) FROM public.followers WHERE following_id = p.id),
        'following_count', (SELECT COUNT(*) FROM public.followers WHERE follower_id = p.id),
        'total_gifts_received', (SELECT COALESCE(SUM(coin_value), 0) FROM public.gift_transactions WHERE receiver_id = p.id),
        'total_calls', (SELECT COUNT(*) FROM public.private_calls WHERE caller_id = p.id OR receiver_id = p.id),
        'auth_provider', au.raw_app_meta_data->>'provider',
        'last_sign_in', au.last_sign_in_at,
        'email_confirmed', au.email_confirmed_at IS NOT NULL
    ) INTO result
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.id
    WHERE p.id = _user_id;
    
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_role_frame()
RETURNS TRIGGER AS $$
DECLARE
  default_frame_id UUID;
  v_role_type TEXT;
BEGIN
  -- Determine role type based on context
  IF TG_TABLE_NAME = 'agencies' THEN
    v_role_type := 'agency_owner';
    -- Assign default agency frame to owner
    SELECT id INTO default_frame_id FROM public.role_frames 
    WHERE role_type = 'agency_owner' AND is_default = true AND is_active = true
    LIMIT 1;
    
    IF default_frame_id IS NOT NULL AND NEW.owner_id IS NOT NULL THEN
      INSERT INTO public.user_role_frames (user_id, frame_id, role_type, notes)
      VALUES (NEW.owner_id, default_frame_id, 'agency_owner', 'Auto-assigned on agency creation')
      ON CONFLICT (user_id, frame_id) DO NOTHING;
    END IF;
    
  ELSIF TG_TABLE_NAME = 'topup_helpers' THEN
    v_role_type := 'helper';
    -- Assign default helper frame
    SELECT id INTO default_frame_id FROM public.role_frames 
    WHERE role_type = 'helper' AND is_default = true AND is_active = true
    LIMIT 1;
    
    IF default_frame_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
      INSERT INTO public.user_role_frames (user_id, frame_id, role_type, notes)
      VALUES (NEW.user_id, default_frame_id, 'helper', 'Auto-assigned as topup helper')
      ON CONFLICT (user_id, frame_id) DO NOTHING;
    END IF;
    
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    -- Assign admin frame to admins
    IF NEW.role = 'admin' THEN
      SELECT id INTO default_frame_id FROM public.role_frames 
      WHERE role_type = 'admin' AND is_default = true AND is_active = true
      LIMIT 1;
      
      IF default_frame_id IS NOT NULL THEN
        INSERT INTO public.user_role_frames (user_id, frame_id, role_type, notes)
        VALUES (NEW.user_id, default_frame_id, 'admin', 'Auto-assigned as admin')
        ON CONFLICT (user_id, frame_id) DO NOTHING;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_create_agency(
  _name text,
  _agency_code text,
  _owner_id uuid,
  _level text DEFAULT 'A1',
  _commission_rate numeric DEFAULT 2
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_agency_id uuid;
  current_user_role text;
BEGIN
  -- Check if caller is admin
  SELECT role INTO current_user_role 
  FROM profiles 
  WHERE id = auth.uid();
  
  IF current_user_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can create agencies';
  END IF;
  
  -- Insert the agency
  INSERT INTO agencies (
    name,
    agency_code,
    owner_id,
    level,
    commission_rate,
    is_active,
    is_blocked,
    total_hosts,
    total_agents,
    wallet_balance
  ) VALUES (
    _name,
    _agency_code,
    _owner_id,
    _level,
    _commission_rate,
    true,
    false,
    0,
    0,
    0
  )
  RETURNING id INTO new_agency_id;
  
  -- Update owner profile to mark as agency owner
  IF _owner_id IS NOT NULL THEN
    UPDATE profiles 
    SET is_agency_owner = true 
    WHERE id = _owner_id;
  END IF;
  
  RETURN new_agency_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_recordings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE stream_recordings
  SET status = 'expired'
  WHERE expires_at < now() AND status = 'ready';
  
  -- Optionally delete very old records (30+ days)
  DELETE FROM stream_recordings
  WHERE expires_at < (now() - interval '30 days');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_account_by_device_id(p_device_id text)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  gender text,
  is_host boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.display_name,
    p.avatar_url,
    p.gender,
    p.is_host
  FROM public.profiles p
  WHERE p.device_id = p_device_id
  AND p.is_deleted IS NOT TRUE
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_online_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- === STALE CALL CLEANUP ===
  -- Auto-miss ringing calls older than 60 seconds
  UPDATE private_calls 
  SET status = 'missed', ended_at = now(), end_reason = 'timeout'
  WHERE status = 'ringing' AND created_at < now() - interval '60 seconds';

  -- Auto-end connected calls older than 2 hours (safety net)
  UPDATE private_calls 
  SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status = 'connected' AND started_at < now() - interval '2 hours';

  -- Reset is_in_call for users with no active calls
  UPDATE profiles 
  SET is_in_call = false, current_call_id = NULL
  WHERE is_in_call = true 
  AND id NOT IN (
    SELECT caller_id FROM private_calls WHERE status IN ('ringing', 'connected')
    UNION
    SELECT host_id FROM private_calls WHERE status IN ('ringing', 'connected')
  );

  -- === STALE ONLINE CLEANUP ===
  -- Regular users: offline after 2 minutes of no heartbeat
  UPDATE profiles
  SET is_online = false
  WHERE is_online = true
    AND is_host = false
    AND last_seen_at < now() - interval '2 minutes';

  -- Hosts: offline after 1 hour of no heartbeat
  UPDATE profiles
  SET is_online = false
  WHERE is_online = true
    AND is_host = true
    AND last_seen_at < now() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_host_beans_only(
  p_host_id uuid,
  p_beans_to_add numeric,
  p_new_total numeric,
  p_new_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET 
    pending_earnings = COALESCE(pending_earnings, 0) + p_beans_to_add,
    total_earnings = p_new_total,
    host_level = p_new_level
  WHERE id = p_host_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_host_earnings(
  host_id uuid,
  beans_amount numeric,
  new_total_earnings numeric,
  new_host_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET 
    pending_earnings = COALESCE(pending_earnings, 0) + beans_amount,
    total_earnings = new_total_earnings,
    host_level = new_host_level
  WHERE id = host_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_add_host_beans(
  p_host_id uuid,
  p_beans_to_add numeric,
  p_new_total_earnings numeric,
  p_new_host_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Use a raw UPDATE that only touches the specific columns we need
  -- This avoids foreign key validation issues with equipped_frame_id
  UPDATE profiles
  SET 
    pending_earnings = COALESCE(pending_earnings, 0) + p_beans_to_add,
    total_earnings = p_new_total_earnings,
    host_level = p_new_host_level
  WHERE id = p_host_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.add_beans_to_host(
  p_host_id UUID,
  p_beans_amount INTEGER,
  p_total_earnings INTEGER DEFAULT 0,
  p_host_level INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add beans to hosts';
  END IF;
  UPDATE profiles
  SET beans = COALESCE(beans, 0) + p_beans_amount,
      beans_balance = COALESCE(beans_balance, 0) + p_beans_amount,
      total_earnings = COALESCE(total_earnings, 0) + p_total_earnings,
      host_level = GREATEST(COALESCE(host_level, 1), p_host_level),
      updated_at = now()
  WHERE id = p_host_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_host_earnings_only(p_host_id uuid, p_beans_to_add bigint, p_new_total_earnings bigint, p_new_host_level integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_pending bigint;
  v_new_pending bigint;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT COALESCE(pending_earnings, 0)::bigint INTO v_current_pending
  FROM profiles WHERE id = p_host_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Host not found');
  END IF;
  
  v_new_pending := v_current_pending + p_beans_to_add;
  
  UPDATE profiles
  SET pending_earnings = v_new_pending, total_earnings = p_new_total_earnings,
      host_level = p_new_host_level, updated_at = now()
  WHERE id = p_host_id;
  
  RETURN jsonb_build_object(
    'success', true, 'new_pending_earnings', v_new_pending,
    'total_earnings', p_new_total_earnings, 'host_level', p_new_host_level
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_expired_items()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_purchase RECORD;
  profile_record RECORD;
  category_column TEXT;
  previous_column TEXT;
BEGIN
  -- Find all expired purchases that are still equipped
  FOR expired_purchase IN 
    SELECT up.*, si.category 
    FROM user_purchases up
    JOIN shop_items si ON up.item_id = si.id
    WHERE up.is_equipped = true 
    AND up.expires_at IS NOT NULL 
    AND up.expires_at < NOW()
    AND up.is_active = true
  LOOP
    -- Determine which column to update based on category
    CASE expired_purchase.category
      WHEN 'frame', 'portrait_frame' THEN
        category_column := 'equipped_frame_id';
        previous_column := 'previous_frame_id';
      WHEN 'entrance', 'entrance_effect' THEN
        category_column := 'equipped_entrance_id';
        previous_column := 'previous_entrance_id';
      WHEN 'chat_bubble' THEN
        category_column := 'equipped_bubble_id';
        previous_column := 'previous_bubble_id';
      WHEN 'vehicle' THEN
        category_column := 'equipped_vehicle_id';
        previous_column := 'previous_vehicle_id';
      WHEN 'medal' THEN
        category_column := 'equipped_medal_id';
        previous_column := 'previous_medal_id';
      WHEN 'noble_card' THEN
        category_column := 'equipped_noble_card_id';
        previous_column := 'previous_noble_card_id';
      WHEN 'entry_banner' THEN
        category_column := 'equipped_entry_banner_id';
        previous_column := 'previous_entry_banner_id';
      WHEN 'entry_bar', 'entry_name_bar' THEN
        category_column := 'equipped_entry_name_bar_id';
        previous_column := 'previous_entry_name_bar_id';
      ELSE
        CONTINUE;
    END CASE;

    -- Restore previous item for this user
    EXECUTE format(
      'UPDATE profiles SET %I = %I, %I = NULL WHERE id = $1',
      category_column, previous_column, previous_column
    ) USING expired_purchase.user_id;

    -- Mark purchase as unequipped
    UPDATE user_purchases 
    SET is_equipped = false 
    WHERE id = expired_purchase.id;

    RAISE NOTICE 'Restored previous item for user % category %', 
      expired_purchase.user_id, expired_purchase.category;
  END LOOP;
END;
$$;