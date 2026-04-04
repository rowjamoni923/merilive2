-- Reduce Supabase storage growth from oversized log tables
-- 1) Add helpful indexes for cleanup jobs
CREATE INDEX IF NOT EXISTS idx_system_error_logs_created_at
  ON public.system_error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_security_logs_created_at
  ON public.session_security_logs (created_at DESC);

-- 2) Create a retention cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_application_logs()
RETURNS TABLE(system_error_logs_deleted bigint, session_security_logs_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_deleted bigint := 0;
  v_session_deleted bigint := 0;
BEGIN
  DELETE FROM public.system_error_logs
  WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_system_deleted = ROW_COUNT;

  DELETE FROM public.session_security_logs
  WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_session_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_system_deleted, v_session_deleted;
END;
$$;

-- 3) Allow admins/service usage to trigger cleanup safely if needed
REVOKE ALL ON FUNCTION public.cleanup_application_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_application_logs() TO service_role;