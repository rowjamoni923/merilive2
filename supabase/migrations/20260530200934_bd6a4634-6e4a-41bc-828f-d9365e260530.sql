CREATE OR REPLACE FUNCTION public.approve_rating_reward(p_claim_id uuid, p_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_claim RECORD;
  v_amount bigint;
  v_type text;
BEGIN
  -- Admin check
  IF NOT (public.is_admin(p_admin_id) OR public.is_active_admin_session()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Select claim with row lock
  SELECT * INTO v_claim FROM public.rating_reward_claims WHERE id=p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error','Claim not found'); END IF;
  
  -- Check status
  IF v_claim.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error','Already processed');
  END IF;

  -- Use reward type and amount from the claim record (set during submission)
  v_type := v_claim.reward_type;
  v_amount := v_claim.reward_amount;

  -- Fallback if for some reason type/amount are missing (should not happen with new submissions)
  IF v_type IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      -- Optional: you could recalculate here or just fail.
      -- Given user's request for 100% accuracy, failing is better to ensure admin sets it right.
      RETURN jsonb_build_object('success', false, 'error','Claim reward data missing or invalid');
  END IF;

  -- BYPASS sensitive-field trigger for the audited reward credit
  PERFORM set_config('app.bypass_profile_protection','true', true);

  IF v_type = 'beans' THEN
    UPDATE public.profiles SET beans = COALESCE(beans,0) + v_amount WHERE id=v_claim.user_id;
  ELSE
    -- Assuming diamonds/coins are same in this context (some apps use 'coins' for diamonds)
    UPDATE public.profiles SET coins = COALESCE(coins,0) + v_amount WHERE id=v_claim.user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection','false', true);

  -- Update claim status
  UPDATE public.rating_reward_claims
     SET status='approved', 
         reviewed_by=p_admin_id, 
         reviewed_at=now()
   WHERE id=p_claim_id;

  RETURN jsonb_build_object('success', true, 'claim_id', p_claim_id, 'reward_type', v_type, 'reward_amount', v_amount);
END;
$function$;
