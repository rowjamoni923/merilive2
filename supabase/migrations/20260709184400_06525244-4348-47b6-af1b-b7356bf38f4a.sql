CREATE OR REPLACE FUNCTION public.approve_rating_reward(p_claim_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_claim RECORD;
  v_amount bigint;
  v_type text;
  v_balance_after bigint;
BEGIN
  IF NOT (public.is_admin(p_admin_id) OR public.is_active_admin_session()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_claim
  FROM public.rating_reward_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim not found');
  END IF;

  IF v_claim.status IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyProcessed', true,
      'claim_id', p_claim_id,
      'status', v_claim.status,
      'reward_type', v_claim.reward_type,
      'reward_amount', COALESCE(v_claim.reward_amount, 0)
    );
  END IF;

  IF v_claim.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim is not pending');
  END IF;

  v_type := COALESCE(NULLIF(v_claim.reward_type, ''), 'diamonds');
  v_amount := COALESCE(v_claim.reward_amount, v_claim.reward_coins, 0);

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim reward data missing or invalid');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF v_type = 'beans' THEN
    UPDATE public.profiles
    SET beans = COALESCE(beans, 0) + v_amount,
        updated_at = now()
    WHERE id = v_claim.user_id
    RETURNING COALESCE(beans, 0) INTO v_balance_after;
  ELSE
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + v_amount,
        updated_at = now()
    WHERE id = v_claim.user_id
    RETURNING COALESCE(coins, 0) INTO v_balance_after;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  IF v_balance_after IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  UPDATE public.rating_reward_claims
  SET status = 'approved',
      reviewed_by = p_admin_id,
      reviewed_at = now(),
      rejection_reason = NULL,
      reward_type = v_type,
      reward_amount = v_amount
  WHERE id = p_claim_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', p_claim_id,
    'status', 'approved',
    'reward_type', v_type,
    'reward_amount', v_amount,
    'new_balance', v_balance_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_rating_reward(
  p_claim_id uuid,
  p_admin_id uuid,
  p_reason text DEFAULT 'Screenshot does not show a valid 5-star rating'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_claim RECORD;
  v_reason text;
BEGIN
  IF NOT (public.is_admin(p_admin_id) OR public.is_active_admin_session()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_claim
  FROM public.rating_reward_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim not found');
  END IF;

  IF v_claim.status IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyProcessed', true,
      'claim_id', p_claim_id,
      'status', v_claim.status,
      'reward_type', v_claim.reward_type,
      'reward_amount', COALESCE(v_claim.reward_amount, 0)
    );
  END IF;

  IF v_claim.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim is not pending');
  END IF;

  v_reason := NULLIF(trim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    v_reason := 'Screenshot does not show a valid 5-star rating';
  END IF;

  UPDATE public.rating_reward_claims
  SET status = 'rejected',
      reviewed_by = p_admin_id,
      reviewed_at = now(),
      rejection_reason = v_reason
  WHERE id = p_claim_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', p_claim_id,
    'status', 'rejected',
    'reward_type', v_claim.reward_type,
    'reward_amount', COALESCE(v_claim.reward_amount, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_rating_reward(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_rating_reward(uuid, uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.reject_rating_reward(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_rating_reward(uuid, uuid, text) TO anon, authenticated, service_role;