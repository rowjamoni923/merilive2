CREATE OR REPLACE FUNCTION public.tg_app_sync_agency_withdrawals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agency_owner uuid;
  v_assigned_helper_user uuid;
BEGIN
  SELECT owner_id INTO v_agency_owner
  FROM public.agencies
  WHERE id = COALESCE(NEW.agency_id, OLD.agency_id);

  PERFORM public.emit_app_sync_notification(
    v_agency_owner,
    'agency_withdrawals',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('agency_id', COALESCE(NEW.agency_id, OLD.agency_id), 'status', COALESCE(NEW.status, OLD.status))
  );

  SELECT user_id INTO v_assigned_helper_user
  FROM public.topup_helpers
  WHERE id = COALESCE(NEW.assigned_helper_id, OLD.assigned_helper_id);

  IF v_assigned_helper_user IS NOT NULL THEN
    PERFORM public.emit_app_sync_notification(
      v_assigned_helper_user,
      'agency_withdrawals',
      TG_OP,
      COALESCE(NEW.id, OLD.id)::text,
      jsonb_build_object(
        'agency_id', COALESCE(NEW.agency_id, OLD.agency_id),
        'helper_id', COALESCE(NEW.assigned_helper_id, OLD.assigned_helper_id),
        'status', COALESCE(NEW.status, OLD.status)
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;