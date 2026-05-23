CREATE TABLE IF NOT EXISTS public.play_integrity_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  device_id text,
  package_name text,
  app_version_code bigint,
  app_recognition_verdict text,
  device_recognition_verdict text[],
  account_details text,
  basic_integrity boolean,
  meets_device_integrity boolean,
  meets_strong_integrity boolean,
  meets_virtual_integrity boolean,
  nonce text,
  raw_verdict_json jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS play_integrity_verdicts_user_idx
  ON public.play_integrity_verdicts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS play_integrity_verdicts_device_idx
  ON public.play_integrity_verdicts (device_id, created_at DESC);

ALTER TABLE public.play_integrity_verdicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own verdicts"
  ON public.play_integrity_verdicts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
