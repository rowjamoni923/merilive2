
-- ============================================================
-- Pkg312: Tasks & Daily Rewards hardening
-- ============================================================

-- 1) Lock down direct client writes on reward/progress tables.
--    The SECURITY DEFINER RPCs still write because they bypass RLS.
DROP POLICY IF EXISTS "u_ins_login_claims" ON public.daily_login_claims;
DROP POLICY IF EXISTS "u_ins_streaks"      ON public.user_login_streaks;
DROP POLICY IF EXISTS "u_upd_streaks"      ON public.user_login_streaks;
DROP POLICY IF EXISTS "Users can insert own task progress" ON public.user_task_progress;
DROP POLICY IF EXISTS "Users can update own task progress" ON public.user_task_progress;

-- Reads stay (Users see only their own rows). Admin policies untouched.

-- 2) Harden claim_daily_login_reward — ignore client-supplied dates,
--    always derive from get_task_reset_date().
CREATE OR REPLACE FUNCTION public.claim_daily_login_reward(
  _claimed_date date DEFAULT NULL,
  _day_start    timestamptz DEFAULT NULL,
  _day_end      timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _is_host boolean;
  _server_date date;
  _yesterday   date;
  _existing_claim record;
  _last_claim record;
  _next_day int;
  _reward record;
  _coins_to_add int;
  _diamonds_to_add int;
  _total_amount int;
  _primary_type text;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Hosts (female) not eligible.
  SELECT COALESCE(is_host, false) INTO _is_host
  FROM public.profiles WHERE id = _user_id;
  IF COALESCE(_is_host, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hosts are not eligible for daily rewards');
  END IF;

  -- IGNORE client-supplied dates; derive authoritative reset day server-side.
  _server_date := public.get_task_reset_date();
  _yesterday   := _server_date - INTERVAL '1 day';

  -- Already claimed today?
  SELECT * INTO _existing_claim
  FROM public.daily_login_claims
  WHERE user_id = _user_id
    AND claimed_date = _server_date
  ORDER BY claimed_at DESC
  LIMIT 1;

  IF _existing_claim IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed today');
  END IF;

  -- Streak: continue if yesterday's claim exists, else reset to Day 1.
  SELECT * INTO _last_claim
  FROM public.daily_login_claims
  WHERE user_id = _user_id
  ORDER BY claimed_at DESC
  LIMIT 1;

  IF _last_claim IS NOT NULL AND _last_claim.claimed_date = _yesterday THEN
    _next_day := (COALESCE(_last_claim.day_number, 0) % 7) + 1;
  ELSE
    _next_day := 1;
  END IF;

  SELECT * INTO _reward
  FROM public.daily_login_rewards_config
  WHERE day_number = _next_day AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward config not found');
  END IF;

  _coins_to_add    := COALESCE(_reward.reward_coins, 0);
  _diamonds_to_add := COALESCE(_reward.reward_diamonds, 0);

  IF _coins_to_add = 0 AND _diamonds_to_add = 0 AND COALESCE(_reward.reward_amount, 0) > 0 THEN
    IF COALESCE(_reward.reward_type, 'coins') = 'diamonds' THEN
      _diamonds_to_add := _reward.reward_amount;
    ELSE
      _coins_to_add := _reward.reward_amount;
    END IF;
  END IF;

  _total_amount := _coins_to_add + _diamonds_to_add;
  _primary_type := CASE WHEN _coins_to_add >= _diamonds_to_add THEN 'coins' ELSE 'diamonds' END;

  -- Insert claim atomically; uniqueness on (user_id,claimed_date) is the real guard.
  BEGIN
    INSERT INTO public.daily_login_claims (
      user_id, reward_id, day_number, reward_type, reward_amount, claimed_date
    )
    VALUES (
      _user_id, _reward.id, _next_day, _primary_type, _total_amount, _server_date
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed today');
  END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  IF _coins_to_add > 0 THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + _coins_to_add WHERE id = _user_id;
  END IF;
  IF _diamonds_to_add > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _diamonds_to_add WHERE id = _user_id;
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  INSERT INTO public.user_login_streaks (user_id, current_streak, last_login_date, total_logins)
  VALUES (_user_id, _next_day, _server_date, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET current_streak = _next_day,
      last_login_date = _server_date,
      total_logins = COALESCE(public.user_login_streaks.total_logins, 0) + 1;

  RETURN jsonb_build_object(
    'success', true,
    'day', _next_day,
    'reward_type', _primary_type,
    'reward_amount', _total_amount,
    'coins', _coins_to_add,
    'diamonds', _diamonds_to_add,
    'bonus_label', _reward.bonus_label
  );
END;
$function$;

-- Ensure (user_id,claimed_date) is unique so race-condition double-claims fail.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_login_claims_user_date
  ON public.daily_login_claims (user_id, claimed_date);

REVOKE EXECUTE ON FUNCTION public.claim_daily_login_reward(date,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_daily_login_reward(date,timestamptz,timestamptz) TO authenticated;

-- 3) Harden update_task_progress(_task_type,_value,_increment)
--    Server now computes authoritative progress from source tables.
--    Client _value / _increment are ignored.
CREATE OR REPLACE FUNCTION public.update_task_progress(
  _task_type text,
  _value     integer DEFAULT NULL,
  _increment integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _task RECORD;
  _reset date;
  _window_start timestamptz;
  _window_end   timestamptz;
  _server_progress integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF _task_type NOT IN ('first_live','live_minutes','viewers','first_gift','messages_sent') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown task type');
  END IF;

  FOR _task IN
    SELECT id, requirement_value, COALESCE(mission_bucket, 'daily') AS mission_bucket
    FROM public.daily_tasks
    WHERE is_active = true
      AND requirement_type = _task_type
  LOOP
    _reset := CASE _task.mission_bucket
      WHEN 'weekly'      THEN public.get_task_week_reset_date()
      WHEN 'achievement' THEN date '1970-01-01'
      ELSE public.get_task_reset_date()
    END;

    -- Window for "activity since reset" — use reset date at 00:30 Europe/London.
    _window_start := ((_reset::timestamp + interval '30 minutes') AT TIME ZONE 'Europe/London');
    _window_end   := now() + interval '1 minute';

    -- Compute server-authoritative progress for this task type.
    _server_progress := 0;
    IF _task_type = 'first_live' THEN
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM public.live_streams
        WHERE host_id = _user_id
          AND (COALESCE(started_at, created_at) >= _window_start)
      ) THEN 1 ELSE 0 END INTO _server_progress;

    ELSIF _task_type = 'live_minutes' THEN
      SELECT COALESCE(SUM(
        GREATEST(
          EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - COALESCE(started_at, created_at))) / 60.0,
          0
        )
      ), 0)::int INTO _server_progress
      FROM public.live_streams
      WHERE host_id = _user_id
        AND COALESCE(started_at, created_at) >= _window_start;

    ELSIF _task_type = 'viewers' THEN
      SELECT COALESCE(MAX(viewer_count), 0)::int INTO _server_progress
      FROM public.live_streams
      WHERE host_id = _user_id
        AND COALESCE(started_at, created_at) >= _window_start;

    ELSIF _task_type = 'first_gift' THEN
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM public.gift_transactions
        WHERE receiver_id = _user_id
          AND created_at >= _window_start
      ) THEN 1 ELSE 0 END INTO _server_progress;

    ELSIF _task_type = 'messages_sent' THEN
      SELECT COUNT(*)::int INTO _server_progress
      FROM public.messages
      WHERE sender_id = _user_id
        AND created_at >= _window_start;
    END IF;

    -- Upsert progress row.
    INSERT INTO public.user_task_progress (
      user_id, task_id, current_count, current_progress,
      reset_date, task_date, is_completed, is_claimed, updated_at
    )
    VALUES (
      _user_id, _task.id,
      _server_progress, _server_progress,
      _reset, _reset,
      _server_progress >= _task.requirement_value,
      false,
      now()
    )
    ON CONFLICT (user_id, task_id, reset_date) DO UPDATE
    SET current_count    = GREATEST(public.user_task_progress.current_count, EXCLUDED.current_count),
        current_progress = GREATEST(COALESCE(public.user_task_progress.current_progress,0), EXCLUDED.current_progress),
        is_completed     = public.user_task_progress.is_completed OR EXCLUDED.is_completed,
        completed_at     = CASE
                             WHEN EXCLUDED.is_completed AND public.user_task_progress.completed_at IS NULL
                               THEN now()
                             ELSE public.user_task_progress.completed_at
                           END,
        updated_at       = now();
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_task_progress(text,integer,integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_task_progress(text,integer,integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_task_reward(uuid,uuid,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_task_reward(uuid,uuid,text) TO authenticated;
