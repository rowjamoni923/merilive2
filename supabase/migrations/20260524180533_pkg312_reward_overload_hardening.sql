-- ============================================================
-- Pkg312 pass-2: Tasks & Daily Rewards overload hardening
-- ============================================================
-- Manual audit finding: older task reward RPC overloads still existed.
-- Keep one canonical implementation: claim_task_reward(uuid,uuid,text).
-- The legacy single-arg overload now delegates through auth.uid() so it cannot
-- drift in reset-date logic, mission buckets, race handling, or reward flags.

DROP FUNCTION IF EXISTS public.claim_task_reward(uuid, uuid);
DROP FUNCTION IF EXISTS public.claim_daily_login_reward();

CREATE OR REPLACE FUNCTION public.claim_task_reward(_user_id uuid, _task_id uuid, _task_date text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _task RECORD;
  _progress RECORD;
  _expected_key text;
  _claim_count int;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden', 'beans', 0, 'coins', 0);
  END IF;

  SELECT * INTO _task FROM public.daily_tasks WHERE id = _task_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found', 'beans', 0, 'coins', 0);
  END IF;

  _expected_key := CASE COALESCE(_task.mission_bucket, 'daily')
    WHEN 'weekly' THEN to_char(public.get_task_week_reset_date(), 'YYYY-MM-DD')
    WHEN 'achievement' THEN '1970-01-01'
    ELSE to_char(public.get_task_reset_date(), 'YYYY-MM-DD')
  END;

  IF _task_date IS NOT NULL AND length(trim(_task_date)) > 0 AND trim(_task_date) <> _expected_key THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task period mismatch', 'beans', 0, 'coins', 0);
  END IF;

  SELECT * INTO _progress
  FROM public.user_task_progress
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _expected_key::date
  FOR UPDATE;

  IF NOT FOUND OR NOT COALESCE(_progress.is_completed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed', 'beans', 0, 'coins', 0);
  END IF;

  IF COALESCE(_progress.is_claimed, false) OR COALESCE(_progress.reward_claimed, false) THEN
    RETURN jsonb_build_object(
      'success', true, 'already_claimed', true,
      'beans', 0, 'coins', 0, 'beans_earned', 0, 'coins_earned', 0
    );
  END IF;

  UPDATE public.user_task_progress
  SET is_claimed = true,
      reward_claimed = true,
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE user_id = _user_id
    AND task_id = _task_id
    AND reset_date = _expected_key::date
    AND COALESCE(is_claimed, false) = false
    AND COALESCE(reward_claimed, false) = false;
  GET DIAGNOSTICS _claim_count = ROW_COUNT;

  IF _claim_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true, 'already_claimed', true,
      'beans', 0, 'coins', 0, 'beans_earned', 0, 'coins_earned', 0
    );
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  IF COALESCE(_task.reward_beans, 0) > 0 THEN
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + _task.reward_beans WHERE id = _user_id;
  END IF;

  IF COALESCE(_task.reward_coins, 0) > 0 THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + _task.reward_coins WHERE id = _user_id;
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'already_claimed', false,
    'beans', COALESCE(_task.reward_beans, 0),
    'coins', COALESCE(_task.reward_coins, 0),
    'beans_earned', COALESCE(_task.reward_beans, 0),
    'coins_earned', COALESCE(_task.reward_coins, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_task_reward(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated', 'beans', 0, 'coins', 0);
  END IF;

  RETURN public.claim_task_reward(_user_id, _task_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_task_reward(
  _user_id uuid,
  _task_id uuid,
  _reset_date text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden', 'beans', 0, 'coins', 0);
  END IF;

  RETURN public.claim_task_reward(_user_id, _task_id, _reset_date);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_task_reward(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_task_reward(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_daily_task_reward(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_daily_login_reward(date,timestamptz,timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_task_progress(text,integer,integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_task_reward(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_task_reward(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_task_reward(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_login_reward(date,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_task_progress(text,integer,integer) TO authenticated;
