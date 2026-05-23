CREATE TABLE IF NOT EXISTS public.play_integrity_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  passed boolean NOT NULL,
  app_verdict text,
  device_verdicts text[],
  account_verdict text,
  package_name text,
  nonce_ok boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_play_integrity_verdicts_user_created
  ON public.play_integrity_verdicts (user_id, created_at DESC);

ALTER TABLE public.play_integrity_verdicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own verdicts"
  ON public.play_integrity_verdicts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);