
DROP FUNCTION IF EXISTS public.cleanup_expired_recordings();

CREATE OR REPLACE FUNCTION public.cleanup_expired_recordings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  UPDATE public.stream_recordings
  SET status = 'expired'
  WHERE expires_at < now() AND status = 'ready';

  DELETE FROM public.stream_recordings
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_recordings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_recordings() TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_expired_recordings_hourly') THEN
    PERFORM cron.schedule(
      'cleanup_expired_recordings_hourly',
      '0 * * * *',
      $cron$SELECT public.cleanup_expired_recordings();$cron$
    );
  END IF;
END $$;
