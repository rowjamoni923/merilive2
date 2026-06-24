-- Ensure profile.is_agency_owner + agency_id sync the moment admin activates/reactivates an agency
-- so the Agency Dashboard menu item appears instantly in the owner's profile.

CREATE OR REPLACE FUNCTION public.admin_set_agency_active_status(_agency_id uuid, _active boolean, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_guard jsonb;
  v_owner uuid;
BEGIN
  v_guard := public._p341_assert_admin_can_target_agency(
    _agency_id,
    ARRAY['agency-management'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  UPDATE public.agencies
     SET is_active = _active,
         is_blocked = NOT _active,
         blocked_reason = CASE WHEN NOT _active THEN COALESCE(NULLIF(trim(_reason), ''), 'Cancelled by admin') ELSE NULL END,
         blocked_at = CASE WHEN NOT _active THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = _agency_id
   RETURNING owner_id INTO v_owner;

  -- When activating, force the owner profile flags so the Agency Dashboard
  -- menu surfaces immediately (idempotent — safe if already true).
  IF _active AND v_owner IS NOT NULL THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET is_agency_owner = true,
           agency_id = _agency_id
     WHERE id = v_owner
       AND (
         COALESCE(is_agency_owner, false) IS DISTINCT FROM true
         OR agency_id IS DISTINCT FROM _agency_id
       );
  END IF;

  PERFORM public.log_admin_action(
    'set_agency_active_status', 'agency', _agency_id::text,
    jsonb_build_object('active', _active, 'reason', _reason, 'admin_id', public.current_admin_id_from_header())
  );

  RETURN jsonb_build_object('success', true, 'active', _active, 'owner_id', COALESCE(v_owner, (v_guard->>'owner_id')::uuid));
END;
$function$;

-- Reactivate (from closed state): same guarantee.
CREATE OR REPLACE FUNCTION public.admin_reactivate_agency(_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
  v_owner uuid;
  v_name text;
BEGIN
  v_admin_id := public.current_admin_id_from_header();

  IF v_admin_id IS NULL
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.agencies
     SET activation_status = 'pending',
         is_active = true,
         is_blocked = false,
         blocked_at = NULL,
         blocked_reason = NULL,
         closed_at = NULL,
         closed_reason = NULL,
         activation_deadline = now() + INTERVAL '30 days',
         updated_at = now()
   WHERE id = _agency_id
   RETURNING owner_id, name INTO v_owner, v_name;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Agency not found';
  END IF;

  -- Ensure owner profile flags are correct so Agency Dashboard menu shows instantly.
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET is_agency_owner = true,
         agency_id = _agency_id
   WHERE id = v_owner
     AND (
       COALESCE(is_agency_owner, false) IS DISTINCT FROM true
       OR agency_id IS DISTINCT FROM _agency_id
     );

  PERFORM public.recalc_agency_activation(_agency_id);

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    v_owner,
    'agency_reactivated',
    'Agency Reactivated',
    'Your agency has been reactivated by admin. You have a fresh 30-day window to activate 10 hosts.',
    jsonb_build_object('agency_id', _agency_id, 'agency_name', v_name)
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';