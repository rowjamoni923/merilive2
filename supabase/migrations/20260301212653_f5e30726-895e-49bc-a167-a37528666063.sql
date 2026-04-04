
-- Add overloaded version of log_admin_action that accepts UUID target_id
-- This fixes the error: function public.log_admin_action(unknown, unknown, uuid, jsonb) does not exist
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action_type text,
  _target_type text,
  _target_id uuid,
  _details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), _action_type, _target_type, _target_id::text, _details);
END;
$$;
