
-- Brute Force Protection: Login Attempts Tracking
CREATE TABLE public.login_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL, -- email or IP
  identifier_type text NOT NULL DEFAULT 'email', -- 'email' or 'ip'
  attempt_at timestamptz NOT NULL DEFAULT now(),
  success boolean DEFAULT false,
  ip_address text,
  user_agent text
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Allow inserts from authenticated and anon (login happens before auth)
CREATE POLICY "Anyone can log attempts"
ON public.login_attempts
FOR INSERT
WITH CHECK (true);

-- Only system/admin can read
CREATE POLICY "Admins can view login attempts"
ON public.login_attempts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true
  )
);

-- Indexes
CREATE INDEX idx_login_attempts_identifier ON public.login_attempts (identifier, attempt_at DESC);
CREATE INDEX idx_login_attempts_cleanup ON public.login_attempts (attempt_at);

-- Account lockout tracking
CREATE TABLE public.account_lockouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL UNIQUE, -- email
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz NOT NULL,
  failed_attempts int DEFAULT 0,
  reason text DEFAULT 'brute_force'
);

ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can check lockout status"
ON public.account_lockouts
FOR SELECT
USING (true);

CREATE POLICY "System can manage lockouts"
ON public.account_lockouts
FOR ALL
USING (true)
WITH CHECK (true);

-- RPC: Check and record login attempt with progressive lockout
CREATE OR REPLACE FUNCTION public.check_brute_force(
  p_identifier text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_count int;
  v_lockout record;
  v_cooldown_seconds int;
  v_max_attempts int := 5;
  v_window_minutes int := 15;
BEGIN
  -- Check existing lockout
  SELECT * INTO v_lockout FROM account_lockouts
  WHERE identifier = p_identifier AND locked_until > now();

  IF v_lockout IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked', true,
      'locked_until', v_lockout.locked_until,
      'remaining_seconds', EXTRACT(EPOCH FROM (v_lockout.locked_until - now()))::int,
      'failed_attempts', v_lockout.failed_attempts
    );
  END IF;

  -- Count recent failed attempts
  SELECT COUNT(*) INTO v_failed_count
  FROM login_attempts
  WHERE identifier = p_identifier
    AND success = false
    AND attempt_at > now() - (v_window_minutes || ' minutes')::interval;

  -- Progressive cooldown: 5 fails = 5min, 10 = 15min, 15 = 30min, 20+ = 60min
  IF v_failed_count >= 20 THEN
    v_cooldown_seconds := 3600; -- 1 hour
  ELSIF v_failed_count >= 15 THEN
    v_cooldown_seconds := 1800; -- 30 min
  ELSIF v_failed_count >= 10 THEN
    v_cooldown_seconds := 900; -- 15 min
  ELSIF v_failed_count >= v_max_attempts THEN
    v_cooldown_seconds := 300; -- 5 min
  ELSE
    v_cooldown_seconds := 0;
  END IF;

  IF v_cooldown_seconds > 0 THEN
    -- Create/update lockout
    INSERT INTO account_lockouts (identifier, locked_until, failed_attempts)
    VALUES (p_identifier, now() + (v_cooldown_seconds || ' seconds')::interval, v_failed_count)
    ON CONFLICT (identifier)
    DO UPDATE SET
      locked_at = now(),
      locked_until = now() + (v_cooldown_seconds || ' seconds')::interval,
      failed_attempts = v_failed_count;

    RETURN jsonb_build_object(
      'allowed', false,
      'locked', true,
      'locked_until', now() + (v_cooldown_seconds || ' seconds')::interval,
      'remaining_seconds', v_cooldown_seconds,
      'failed_attempts', v_failed_count
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'locked', false,
    'failed_attempts', v_failed_count,
    'attempts_remaining', v_max_attempts - v_failed_count
  );
END;
$$;

-- RPC: Record a login attempt
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_identifier text,
  p_success boolean,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO login_attempts (identifier, success, ip_address, user_agent)
  VALUES (p_identifier, p_success, p_ip_address, p_user_agent);

  -- On successful login, clear lockout
  IF p_success THEN
    DELETE FROM account_lockouts WHERE identifier = p_identifier;
  END IF;
END;
$$;

-- Auto-cleanup: remove attempts older than 24h
CREATE OR REPLACE FUNCTION public.cleanup_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM login_attempts WHERE attempt_at < now() - interval '24 hours';
  DELETE FROM account_lockouts WHERE locked_until < now() - interval '1 hour';
END;
$$;
