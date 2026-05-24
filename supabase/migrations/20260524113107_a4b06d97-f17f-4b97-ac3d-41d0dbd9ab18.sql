-- Pkg303: force account-deletion RPCs to act on the authenticated caller only.
CREATE OR REPLACE FUNCTION public.request_account_deletion(user_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  -- Ignore any supplied id; always operate on the caller.
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET deletion_requested_at = now(),
         deletion_scheduled_at = now() + interval '30 days'
   WHERE id = _caller;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET deletion_requested_at = NULL,
         deletion_scheduled_at = NULL
   WHERE id = _caller;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_account_deletion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_account_deletion(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion(uuid)  TO authenticated;