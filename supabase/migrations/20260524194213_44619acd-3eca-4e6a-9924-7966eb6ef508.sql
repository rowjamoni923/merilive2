
-- 1. Drop client direct INSERT policies (admin policy retains)
DROP POLICY IF EXISTS u_ins_invitations ON public.user_invitations;
DROP POLICY IF EXISTS u_ins_inv_claims ON public.invitation_reward_claims;

-- 2. Unique pair index
CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_pair_uniq
  ON public.user_invitations (inviter_id, invitee_id);

-- 3. Status check
ALTER TABLE public.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_status_check;
ALTER TABLE public.user_invitations
  ADD CONSTRAINT user_invitations_status_check
  CHECK (status IN ('pending','verified','rejected'));

-- 4. Server-side record RPC
CREATE OR REPLACE FUNCTION public.record_invitation(_inviter_app_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _invitee uuid;
  _inviter uuid;
BEGIN
  _invitee := auth.uid();
  IF _invitee IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF _inviter_app_uid IS NULL OR length(btrim(_inviter_app_uid)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing inviter');
  END IF;

  SELECT id INTO _inviter
  FROM public.profiles
  WHERE app_uid = btrim(_inviter_app_uid)
    AND COALESCE(is_banned, false) = false
    AND COALESCE(is_deleted, false) = false
  LIMIT 1;

  IF _inviter IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inviter not found');
  END IF;

  IF _inviter = _invitee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot self-invite');
  END IF;

  -- Invitee must not already be attributed to a different inviter
  IF EXISTS (SELECT 1 FROM public.user_invitations WHERE invitee_id = _invitee) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already attributed');
  END IF;

  INSERT INTO public.user_invitations (inviter_id, invitee_id, invitation_code, status, completed_at)
  VALUES (_inviter, _invitee, btrim(_inviter_app_uid), 'verified', now())
  ON CONFLICT (inviter_id, invitee_id) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_invitation(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_invitation(text) TO authenticated;

-- 5. Tier claim eligibility — count only verified invites
CREATE OR REPLACE FUNCTION public.claim_invitation_reward(_tier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _tier RECORD;
  _invite_count int;
  _already_claimed boolean;
  _coins int;
  _beans int;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

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

  SELECT COUNT(*)::int INTO _invite_count
  FROM public.user_invitations
  WHERE inviter_id = _user_id AND status = 'verified';

  IF _invite_count < COALESCE(_tier.min_invites, 0) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Need at least ' || _tier.min_invites || ' verified invites',
      'current_invites', _invite_count
    );
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.invitation_reward_claims
    WHERE claimed_by = _user_id AND invitation_id = _tier_id
  ) INTO _already_claimed;

  IF _already_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed this tier');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _coins > 0 THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + _coins WHERE id = _user_id;
  END IF;

  IF _beans > 0 THEN
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + _beans WHERE id = _user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  INSERT INTO public.invitation_reward_claims (
    claimed_by, invitation_id, reward_type, reward_amount
  ) VALUES (
    _user_id, _tier_id, 'tier_reward', _coins + _beans
  );

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
$$;

REVOKE EXECUTE ON FUNCTION public.claim_invitation_reward(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_invitation_reward(uuid) TO authenticated;
