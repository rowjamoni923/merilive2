
CREATE OR REPLACE FUNCTION public.apply_install_referrer(
  p_user_id uuid,
  p_invite_code text DEFAULT NULL,
  p_agency_code text DEFAULT NULL,
  p_inviter_app_uid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inviter_id uuid;
  _agency_id uuid;
  _result jsonb := jsonb_build_object('success', true);
  _existing uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_user_id');
  END IF;

  -- ====== INVITER ATTRIBUTION ======
  -- Resolve inviter from either invite_code (== inviter app_uid) OR app_uid directly
  IF p_invite_code IS NOT NULL AND btrim(p_invite_code) <> '' THEN
    SELECT id INTO _inviter_id FROM public.profiles
      WHERE app_uid = btrim(p_invite_code) LIMIT 1;
  END IF;

  IF _inviter_id IS NULL AND p_inviter_app_uid IS NOT NULL AND btrim(p_inviter_app_uid) <> '' THEN
    SELECT id INTO _inviter_id FROM public.profiles
      WHERE app_uid = btrim(p_inviter_app_uid) LIMIT 1;
  END IF;

  IF _inviter_id IS NOT NULL AND _inviter_id <> p_user_id THEN
    -- Idempotent: skip if invitee already has any inviter row
    SELECT id INTO _existing FROM public.user_invitations
      WHERE invitee_id = p_user_id LIMIT 1;
    IF _existing IS NULL THEN
      INSERT INTO public.user_invitations (inviter_id, invitee_id, invitation_code, status)
      VALUES (_inviter_id, p_user_id, COALESCE(p_invite_code, p_inviter_app_uid), 'pending');
      _result := _result || jsonb_build_object('inviter_linked', true, 'inviter_id', _inviter_id);
    ELSE
      _result := _result || jsonb_build_object('inviter_linked', false, 'reason', 'already_linked');
    END IF;
  END IF;

  -- ====== AGENCY ATTRIBUTION ======
  IF p_agency_code IS NOT NULL AND btrim(p_agency_code) <> '' THEN
    -- Resolve agency by referral_code (case-insensitive)
    SELECT id INTO _agency_id FROM public.agencies
      WHERE lower(btrim(referral_code)) = lower(btrim(p_agency_code))
      LIMIT 1;

    IF _agency_id IS NOT NULL THEN
      -- Skip if user already linked to ANY agency
      IF NOT EXISTS (SELECT 1 FROM public.agency_hosts WHERE host_id = p_user_id) THEN
        INSERT INTO public.agency_hosts (agency_id, host_id, status, referral_code)
        VALUES (_agency_id, p_user_id, 'pending', btrim(p_agency_code))
        ON CONFLICT DO NOTHING;

        UPDATE public.profiles SET agency_id = _agency_id WHERE id = p_user_id AND agency_id IS NULL;

        _result := _result || jsonb_build_object('agency_linked', true, 'agency_id', _agency_id);
      ELSE
        _result := _result || jsonb_build_object('agency_linked', false, 'reason', 'already_in_agency');
      END IF;
    ELSE
      _result := _result || jsonb_build_object('agency_linked', false, 'reason', 'agency_code_not_found');
    END IF;
  END IF;

  RETURN _result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_install_referrer(uuid, text, text, text) TO authenticated, anon;
