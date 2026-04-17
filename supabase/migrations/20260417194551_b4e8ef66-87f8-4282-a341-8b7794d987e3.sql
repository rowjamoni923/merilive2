
-- Fix #6: Rewrite claim_invitation_reward — server-driven, secure, no double credit

-- Drop old vulnerable signature first
DROP FUNCTION IF EXISTS public.claim_invitation_reward(uuid, integer, integer, integer);

-- New secure version: takes only tier_id, reads everything server-side
CREATE OR REPLACE FUNCTION public.claim_invitation_reward(_tier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _tier RECORD;
  _invite_count int;
  _already_claimed boolean;
  _coins int;
  _beans int;
BEGIN
  -- Auth check
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Load admin-configured tier
  SELECT * INTO _tier
  FROM public.invitation_reward_tiers
  WHERE id = _tier_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tier not found or inactive');
  END IF;

  _coins := COALESCE(_tier.reward_coins, 0);
  _beans := COALESCE(_tier.reward_beans, 0);
  
  IF _coins <= 0 AND _beans <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No reward configured for this tier');
  END IF;

  -- Eligibility: count successful invites for this user
  SELECT COUNT(*)::int INTO _invite_count
  FROM public.user_invitations
  WHERE inviter_id = _user_id;

  IF _invite_count < COALESCE(_tier.min_invites, 0) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Need at least ' || _tier.min_invites || ' invites',
      'current_invites', _invite_count
    );
  END IF;

  -- Duplicate claim check
  SELECT EXISTS(
    SELECT 1 FROM public.invitation_reward_claims
    WHERE claimed_by = _user_id AND invitation_id = _tier_id
  ) INTO _already_claimed;
  
  IF _already_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed this tier');
  END IF;

  -- Credit reward (with profile protection bypass)
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  IF _coins > 0 THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + _coins WHERE id = _user_id;
  END IF;
  
  IF _beans > 0 THEN
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + _beans WHERE id = _user_id;
  END IF;
  
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  -- Record the claim atomically
  INSERT INTO public.invitation_reward_claims (
    claimed_by, invitation_id, reward_type, reward_amount
  ) VALUES (
    _user_id, _tier_id, 'tier_reward', _coins + _beans
  );

  -- Notify
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    _user_id,
    'invitation_reward',
    '🎁 Invitation Reward Claimed!',
    'You received ' || 
      CASE 
        WHEN _coins > 0 AND _beans > 0 THEN _coins || ' coins and ' || _beans || ' beans'
        WHEN _coins > 0 THEN _coins || ' coins'
        ELSE _beans || ' beans'
      END || ' from ' || _tier.tier_name || ' tier!',
    jsonb_build_object('tier_id', _tier_id, 'tier_name', _tier.tier_name, 'coins', _coins, 'beans', _beans)
  );

  RETURN jsonb_build_object(
    'success', true,
    'tier_name', _tier.tier_name,
    'coins', _coins,
    'beans', _beans
  );
END;
$function$;
