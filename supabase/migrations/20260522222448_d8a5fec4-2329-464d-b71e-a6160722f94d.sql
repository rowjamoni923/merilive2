CREATE OR REPLACE FUNCTION public.get_effective_host_percent(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.get_effective_host_percent();
$$;