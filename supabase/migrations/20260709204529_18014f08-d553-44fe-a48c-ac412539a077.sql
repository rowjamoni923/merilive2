CREATE OR REPLACE FUNCTION public.increment_swift_pay_poll_attempts(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.swift_pay_topups
     SET poll_attempts = COALESCE(poll_attempts, 0) + 1
   WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_swift_pay_poll_attempts(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_swift_pay_poll_attempts(uuid[]) TO service_role;