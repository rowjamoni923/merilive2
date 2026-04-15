-- Fix: RPC writes to wrong column name (deletion_scheduled_for instead of deletion_scheduled_at)
CREATE OR REPLACE FUNCTION public.request_account_deletion(user_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles 
  SET deletion_requested_at = now(), 
      deletion_scheduled_at = now() + interval '30 days'
  WHERE id = user_id_param;
END;
$$;