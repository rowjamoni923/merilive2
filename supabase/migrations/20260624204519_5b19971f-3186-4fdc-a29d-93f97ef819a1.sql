
-- 1. Auto-close also detaches hosts so the agency name disappears from their profile
CREATE OR REPLACE FUNCTION public.auto_close_overdue_agencies()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_reason text := 'Your agency was automatically closed because fewer than 10 hosts were activated within the 30-day activation window.';
BEGIN
  FOR r IN
    SELECT id, owner_id, name
      FROM public.agencies
     WHERE activation_status = 'pending'
       AND is_official = false
       AND activation_deadline IS NOT NULL
       AND activation_deadline < now()
       AND active_host_count < 10
  LOOP
    UPDATE public.agencies
       SET activation_status = 'closed',
           is_active = false,
           is_blocked = true,
           blocked_at = COALESCE(blocked_at, now()),
           blocked_reason = COALESCE(blocked_reason, v_reason),
           closed_at = COALESCE(closed_at, now()),
           closed_reason = COALESCE(closed_reason, v_reason),
           updated_at = now()
     WHERE id = r.id;

    -- Detach all hosts so the agency badge disappears from their profile
    UPDATE public.agency_hosts
       SET status = 'left',
           left_at = COALESCE(left_at, now())
     WHERE agency_id = r.id
       AND left_at IS NULL;

    UPDATE public.profiles
       SET agency_id = NULL
     WHERE agency_id = r.id;

    IF r.owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        r.owner_id,
        'agency_closed',
        'Agency Closed',
        v_reason,
        jsonb_build_object('agency_id', r.id, 'agency_name', r.name, 'reason_code', 'host_activation_timeout')
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 2. Admin reactivation RPC
CREATE OR REPLACE FUNCTION public.admin_reactivate_agency(_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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

  -- Recalculate; if it already has 10+ active hosts it will latch back to active
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
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reactivate_agency(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_agency(uuid) TO authenticated, service_role;
