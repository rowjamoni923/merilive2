CREATE OR REPLACE FUNCTION public.reset_host_weekly_state_on_withdrawal(_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles p
  SET previous_host_level = COALESCE(p.host_level, 0),
      host_level = 0,
      weekly_earnings = 0,
      pending_earnings = 0,
      updated_at = now()
  WHERE p.id IN (
    SELECT ah.host_id
    FROM public.agency_hosts ah
    WHERE ah.agency_id = _agency_id
      AND COALESCE(ah.status, 'active') = 'active'
  );

  DELETE FROM public.host_contact_violations hcv
  WHERE hcv.user_id IN (
    SELECT ah.host_id
    FROM public.agency_hosts ah
    WHERE ah.agency_id = _agency_id
      AND COALESCE(ah.status, 'active') = 'active'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_host_weekly_policy_after_withdrawal(p_host_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prev_level integer := 0;
BEGIN
  IF p_host_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_id_required');
  END IF;

  SELECT COALESCE(host_level, 0) INTO v_prev_level
  FROM public.profiles
  WHERE id = p_host_id
  FOR UPDATE;

  UPDATE public.profiles
  SET previous_host_level = v_prev_level,
      host_level = 0,
      weekly_earnings = 0,
      weekly_reset_at = now(),
      updated_at = now()
  WHERE id = p_host_id;

  DELETE FROM public.host_contact_violations
  WHERE user_id = p_host_id;

  RETURN jsonb_build_object(
    'success', true,
    'host_id', p_host_id,
    'previous_host_level', v_prev_level,
    'host_level', 0,
    'weekly_earnings', 0,
    'violations_reset', true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_auto_ban_threshold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_count integer;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.host_contact_violations
  WHERE user_id = v_user_id
    AND created_at > now() - interval '30 days'
    AND COALESCE(is_false_positive, false) = false;

  IF v_count >= 3 THEN
    UPDATE public.profiles
    SET is_blocked = true,
        blocked_at = now(),
        blocked_reason = 'Auto-banned: ' || v_count || ' contact violations in 30 days',
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;