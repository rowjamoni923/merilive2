
-- Fix log_admin_action: restore original signature used by all callers
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action_type text,
  _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL,
  _details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), _action_type, _target_type, _target_id, _details);
END;
$$;
