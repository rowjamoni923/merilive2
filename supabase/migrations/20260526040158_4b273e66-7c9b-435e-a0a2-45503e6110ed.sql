-- 1) Provision internal secret if missing
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'face_cron_secret',
  encode(extensions.gen_random_bytes(32), 'hex'),
  'Internal secret used by DB trigger + pg_cron to authorize face-verification-analyze calls. Do not share.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 2) Schedule per-minute sweeper
-- Unschedule existing job with the same name (safe if missing)
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'face-verification-sweep' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'face-verification-sweep',
  '* * * * *',
  $cron$ SELECT public.sweep_pending_face_verifications(); $cron$
);