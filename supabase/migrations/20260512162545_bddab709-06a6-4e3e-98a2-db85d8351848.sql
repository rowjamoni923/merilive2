CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_user(
  _agency_id uuid,
  _receiver_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_agency_owner_id uuid;
  v_current_balance bigint;
  v_new_user_balance bigint;
  v_agency_name text;
BEGIN
  v_caller := auth.uid();
  PERFORM set_config('app.calling_function', 'agency_send_diamonds_to_user', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF v_caller = _receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  SELECT owner_id, diamond_balance, name INTO v_agency_owner_id, v_current_balance, v_agency_name
  FROM public.agencies
  WHERE id = _agency_id AND COALESCE(is_active, true) = true
  FOR UPDATE;

  IF v_agency_owner_id IS NULL OR v_agency_owner_id <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not agency owner');
  END IF;

  v_current_balance := COALESCE(v_current_balance, 0);
  IF _amount > v_current_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamond balance');
  END IF;

  UPDATE public.agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) - _amount,
      updated_at = now()
  WHERE id = _agency_id;

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _receiver_id
  RETURNING coins INTO v_new_user_balance;

  IF v_new_user_balance IS NULL THEN
    RAISE EXCEPTION 'Receiver not found';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (
    _receiver_id,
    'coins_received',
    'Diamonds Received',
    _amount::text || ' diamonds received from ' || COALESCE(v_agency_name, 'Agency'),
    jsonb_build_object('agency_id', _agency_id, 'agency_name', v_agency_name, 'amount', _amount, 'action_url', '/recharge-history'),
    false,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_agency_balance', v_current_balance - _amount,
    'new_receiver_coins', v_new_user_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_agency(
  _sender_agency_id uuid,
  _target_agency_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_sender_owner_id uuid;
  v_target_owner_id uuid;
  v_sender_balance bigint;
  v_new_target_balance bigint;
  v_sender_agency_name text;
BEGIN
  v_caller := auth.uid();
  PERFORM set_config('app.calling_function', 'agency_send_diamonds_to_agency', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF _sender_agency_id = _target_agency_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to the same agency');
  END IF;

  SELECT owner_id, diamond_balance, name INTO v_sender_owner_id, v_sender_balance, v_sender_agency_name
  FROM public.agencies
  WHERE id = _sender_agency_id AND COALESCE(is_active, true) = true
  FOR UPDATE;

  IF v_sender_owner_id IS NULL OR v_sender_owner_id <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not agency owner');
  END IF;

  SELECT owner_id INTO v_target_owner_id
  FROM public.agencies
  WHERE id = _target_agency_id AND COALESCE(is_active, true) = true
  FOR UPDATE;

  IF v_target_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target agency not found');
  END IF;

  IF v_target_owner_id = v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to your own agency');
  END IF;

  v_sender_balance := COALESCE(v_sender_balance, 0);
  IF _amount > v_sender_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamond balance');
  END IF;

  UPDATE public.agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) - _amount,
      updated_at = now()
  WHERE id = _sender_agency_id;

  UPDATE public.agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount,
      updated_at = now()
  WHERE id = _target_agency_id
  RETURNING diamond_balance INTO v_new_target_balance;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (
    v_target_owner_id,
    'agency_diamond_received',
    'Agency Diamonds Received',
    _amount::text || ' diamonds received from ' || COALESCE(v_sender_agency_name, 'Agency'),
    jsonb_build_object('from_agency_id', _sender_agency_id, 'from_agency_name', v_sender_agency_name, 'target_agency_id', _target_agency_id, 'amount', _amount, 'action_url', '/agency-dashboard'),
    false,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_sender_balance', v_sender_balance - _amount,
    'new_target_balance', v_new_target_balance,
    'target_agency_id', _target_agency_id
  );
END;
$$;