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

CREATE OR REPLACE FUNCTION public.admin_set_agency_permanent(_agency_id uuid, _is_permanent boolean, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := public.current_admin_id_from_header();

  IF v_admin_id IS NULL
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can mark agencies permanent';
  END IF;

  IF _is_permanent THEN
    UPDATE public.agencies
       SET is_permanent = true,
           permanent_reason = _reason,
           permanent_marked_by = COALESCE(v_admin_id, auth.uid()),
           permanent_marked_at = now(),
           activation_status = CASE WHEN activation_status = 'closed' THEN 'active' ELSE activation_status END,
           is_active = true,
           is_blocked = false,
           blocked_reason = NULL,
           closed_at = NULL,
           closed_reason = NULL,
           updated_at = now()
     WHERE id = _agency_id;
  ELSE
    UPDATE public.agencies
       SET is_permanent = false,
           permanent_reason = NULL,
           updated_at = now()
     WHERE id = _agency_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reactivate_agency(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_agency_permanent(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_agency(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_agency_permanent(uuid, boolean, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';