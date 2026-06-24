-- Fix: admin actions that pass _target_id as text (e.g. _user_id::text) were
-- failing with "function public.log_admin_action(unknown, unknown, text, jsonb)
-- does not exist". Add a text overload that forwards to the canonical signature.

CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action_type text,
  _target_type text,
  _target_id   text,
  _details     jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uuid uuid;
BEGIN
  BEGIN
    v_uuid := NULLIF(_target_id, '')::uuid;
  EXCEPTION WHEN others THEN
    v_uuid := NULL;
  END;
  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), _action_type, _target_type, COALESCE(v_uuid::text, _target_id), _details);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) TO authenticated, service_role;