
CREATE TABLE IF NOT EXISTS public.app_update_check_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  current_version_name TEXT,
  current_version_code INTEGER,
  server_version_name TEXT,
  server_version_code INTEGER,
  min_version_code INTEGER,
  update_available BOOLEAN NOT NULL DEFAULT false,
  force_update BOOLEAN NOT NULL DEFAULT false,
  modal_shown BOOLEAN NOT NULL DEFAULT false,
  outcome TEXT NOT NULL DEFAULT 'checked', -- checked | shown | dismissed | store_opened | updated
  device_model TEXT,
  app_build TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.app_update_check_log TO authenticated;
GRANT ALL ON public.app_update_check_log TO service_role;

ALTER TABLE public.app_update_check_log ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert their own check (user_id may be null for anon/native pre-login)
CREATE POLICY "users_can_insert_own_check"
ON public.app_update_check_log
FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Admins can read everything
CREATE POLICY "admins_can_read_logs"
ON public.app_update_check_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

-- Admins can update (e.g., flag outcome later)
CREATE POLICY "admins_can_update_logs"
ON public.app_update_check_log
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() AND au.is_active = true
  )
);

CREATE INDEX IF NOT EXISTS idx_app_update_check_log_created_at
  ON public.app_update_check_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_update_check_log_outcome
  ON public.app_update_check_log (outcome);
CREATE INDEX IF NOT EXISTS idx_app_update_check_log_user
  ON public.app_update_check_log (user_id);
