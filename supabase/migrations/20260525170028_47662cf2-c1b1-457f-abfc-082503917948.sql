CREATE OR REPLACE FUNCTION public.check_brute_force(
  p_identifier text,
  p_action_type text,
  p_ip_address text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_failed_count INT;
  v_max_attempts INT := 5;
  v_cooldown_seconds INT := 0;
  v_lockout RECORD;
BEGIN
  SELECT *
    INTO v_lockout
  FROM public.account_lockouts
  WHERE identifier = p_identifier;

  IF v_lockout.locked_until IS NOT NULL AND v_lockout.locked_until > now() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked', true,
      'locked_until', v_lockout.locked_until,
      'remaining_seconds', EXTRACT(EPOCH FROM (v_lockout.locked_until - now()))::INT,
      'failed_attempts', v_lockout.failed_attempts
    );
  END IF;

  SELECT COUNT(*)
    INTO v_failed_count
  FROM public.login_attempts
  WHERE identifier = p_identifier
    AND success = false
    AND attempt_at > now() - interval '1 hour';

  IF v_failed_count >= 10 THEN
    v_cooldown_seconds := 3600;
  ELSIF v_failed_count >= 7 THEN
    v_cooldown_seconds := 900;
  ELSIF v_failed_count >= v_max_attempts THEN
    v_cooldown_seconds := 300;
  END IF;

  IF v_cooldown_seconds > 0 THEN
    INSERT INTO public.account_lockouts (identifier, locked_until, failed_attempts)
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