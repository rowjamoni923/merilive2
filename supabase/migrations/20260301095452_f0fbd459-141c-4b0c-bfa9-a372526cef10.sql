
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _admin_id uuid,
  _target_id uuid,
  _action_type text,
  _details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_logs (admin_id, target_id, action_type, details, target_type)
  VALUES (_admin_id, _target_id::text, _action_type, _details, 'support_ticket');
END;
$$;
