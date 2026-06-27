CREATE OR REPLACE FUNCTION public.claim_device_id(p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _clean text := NULLIF(btrim(COALESCE(p_device_id, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _clean IS NULL THEN
    RAISE EXCEPTION 'invalid_device_id';
  END IF;

  -- Bypass profile-protection trigger for this controlled, server-side flow.
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Release the device_id from any other (non-deleted) profile that still holds it.
  UPDATE public.profiles
     SET device_id = NULL
   WHERE device_id = _clean
     AND id <> _uid
     AND COALESCE(is_deleted, false) = false;

  -- Also release from soft-deleted rows to avoid future surprises.
  UPDATE public.profiles
     SET device_id = NULL
   WHERE device_id = _clean
     AND id <> _uid
     AND COALESCE(is_deleted, false) = true;

  -- Assign to the calling user (no-op if already equal).
  UPDATE public.profiles
     SET device_id = _clean
   WHERE id = _uid
     AND (device_id IS DISTINCT FROM _clean);

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_device_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_device_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_device_id(text) TO service_role;