
-- ============================================
-- FIX SECURITY DEFINER FUNCTIONS: Add auth checks
-- ============================================

-- 1. add_coins: Add admin-only check (general coin adding should be admin only)
CREATE OR REPLACE FUNCTION public.add_coins(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_balance INTEGER;
BEGIN
  -- Auth check: only admins or system (trigger) context
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE profiles
  SET coins = coins + p_amount
  WHERE id = p_user_id
  RETURNING coins INTO result_balance;

  IF result_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
END;
$$;

-- 2. deduct_coins: Ensure user can only deduct from themselves, or admin/system
CREATE OR REPLACE FUNCTION public.deduct_coins(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_balance INTEGER;
  rows_affected INTEGER;
BEGIN
  -- Auth check: user can deduct from self, admin can deduct from anyone, system (NULL) allowed
  IF auth.uid() IS NOT NULL 
     AND auth.uid() != p_user_id 
     AND NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE profiles
  SET coins = coins - p_amount
  WHERE id = p_user_id
    AND coins >= p_amount
  RETURNING coins INTO result_balance;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  IF rows_affected = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'new_balance', 0);
  ELSE
    RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
  END IF;
END;
$$;

-- 3. add_to_helper_wallet: Admin or system only
CREATE OR REPLACE FUNCTION public.add_to_helper_wallet(_helper_id uuid, _amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add to helper wallet';
  END IF;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE topup_helpers 
  SET wallet_balance = COALESCE(wallet_balance, 0) + _amount
  WHERE id = _helper_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Helper not found';
  END IF;
END;
$$;

-- 4. deduct_helper_wallet: Admin or system only
CREATE OR REPLACE FUNCTION public.deduct_helper_wallet(_helper_id uuid, _amount numeric, _update_total_sold boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance NUMERIC;
  _new_balance NUMERIC;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT wallet_balance INTO _current_balance
  FROM topup_helpers
  WHERE id = _helper_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Helper not found');
  END IF;

  _current_balance := COALESCE(_current_balance, 0);

  IF _current_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', _current_balance);
  END IF;

  _new_balance := _current_balance - _amount;

  IF _update_total_sold THEN
    UPDATE topup_helpers 
    SET wallet_balance = _new_balance,
        total_sold = COALESCE(total_sold, 0) + _amount
    WHERE id = _helper_id;
  ELSE
    UPDATE topup_helpers 
    SET wallet_balance = _new_balance
    WHERE id = _helper_id;
  END IF;

  RETURN json_build_object('success', true, 'new_balance', _new_balance, 'deducted', _amount);
END;
$$;

-- 5. admin_clear_frame_references: Add admin check
CREATE OR REPLACE FUNCTION public.admin_clear_frame_references(frame_id_to_clear uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can clear frame references';
  END IF;

  UPDATE profiles SET frame_id = NULL WHERE frame_id = frame_id_to_clear;
  UPDATE profiles SET equipped_frame_id = NULL WHERE equipped_frame_id = frame_id_to_clear;
END;
$$;

-- 6. admin_remove_face_verification: Add admin check
CREATE OR REPLACE FUNCTION public.admin_remove_face_verification(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can remove face verification';
  END IF;

  UPDATE profiles
  SET is_face_verified = false, face_verified_at = null
  WHERE id = _user_id;
  
  DELETE FROM face_verification_submissions WHERE user_id = _user_id;
  
  RETURN true;
END;
$$;

-- 7. cancel_account_deletion: User can only cancel their own
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

-- 8. manual_credit_call_earnings: Verify admin_id matches auth.uid()
CREATE OR REPLACE FUNCTION public.manual_credit_call_earnings(_call_id uuid, _admin_id uuid, _notes text DEFAULT NULL)
RETURNS jsonb
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
      total_earnings = COALESCE(total_earnings, 0) + v_host_earnings
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

-- 9. bulk_credit_call_earnings: Add admin check
CREATE OR REPLACE FUNCTION public.bulk_credit_call_earnings(_admin_id uuid, _call_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_id UUID;
  v_result JSONB;
  v_success_count INTEGER := 0;
  v_fail_count INTEGER := 0;
  v_total_credited INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND (auth.uid() != _admin_id OR NOT public.is_admin(auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  FOREACH v_call_id IN ARRAY _call_ids
  LOOP
    v_result := manual_credit_call_earnings(v_call_id, _admin_id, 'Bulk credit by admin');
    IF (v_result->>'success')::BOOLEAN THEN
      v_success_count := v_success_count + 1;
      v_total_credited := v_total_credited + COALESCE((v_result->>'earnings_credited')::INTEGER, 0);
    ELSE
      v_fail_count := v_fail_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true, 'credited_count', v_success_count,
    'failed_count', v_fail_count, 'total_beans_credited', v_total_credited
  );
END;
$$;

-- 10. update_host_earnings_only: Admin or system only
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

-- 11. increment_agency_agents: Admin or system only
CREATE OR REPLACE FUNCTION public.increment_agency_agents(agency_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE agencies 
  SET total_agents = COALESCE(total_agents, 0) + 1, updated_at = NOW()
  WHERE id = agency_uuid;
END;
$$;

-- 12. create_sub_agent: Verify agency ownership
CREATE OR REPLACE FUNCTION public.create_sub_agent(_agency_id uuid, _user_id uuid, _referrer_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referral_code TEXT;
  _sub_agent_id UUID;
BEGIN
  -- Verify caller is agency owner or admin
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_admin(auth.uid()) AND NOT EXISTS (
      SELECT 1 FROM agencies WHERE id = _agency_id AND owner_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only agency owner or admin can create sub-agents';
    END IF;
  END IF;

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
