
-- Phase 5: Skip Cooldown + Anti-Abuse
-- Extend skip counters table with sliding-window state
ALTER TABLE public.random_call_skip_counters
  ADD COLUMN IF NOT EXISTS soft_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS soft_window_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extended_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extended_window_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cooldown_reason TEXT,
  ADD COLUMN IF NOT EXISTS reports_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_report_at TIMESTAMPTZ;

-- Host-side: track report count for auto-suspend
ALTER TABLE public.host_match_availability
  ADD COLUMN IF NOT EXISTS reports_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reports_window_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_suspend_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspend_reason TEXT;

-- Helper: get tier multiplier for a user
CREATE OR REPLACE FUNCTION public.get_random_skip_multiplier(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_settings RECORD;
  v_prof RECORD;
BEGIN
  SELECT vip_skip_cooldown_multiplier, svip_skip_cooldown_multiplier
    INTO v_settings FROM public.random_call_settings WHERE id = 1;
  SELECT is_vip, COALESCE(vip_level, 0) AS vip_level
    INTO v_prof FROM public.profiles WHERE id = p_user_id;
  IF v_prof IS NULL THEN RETURN 1.0; END IF;
  IF v_prof.vip_level >= 6 THEN
    RETURN COALESCE(v_settings.svip_skip_cooldown_multiplier, 0.25);
  ELSIF v_prof.is_vip THEN
    RETURN COALESCE(v_settings.vip_skip_cooldown_multiplier, 0.5);
  END IF;
  RETURN 1.0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Check whether a user can match (cooldown / daily cap)
CREATE OR REPLACE FUNCTION public.check_random_skip_cooldown(p_user_id UUID)
RETURNS jsonb AS $$
DECLARE
  v_settings RECORD;
  v_row RECORD;
  v_today DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_daily_used INT := 0;
  v_remaining INT;
  v_cooldown_remaining INT := 0;
BEGIN
  SELECT * INTO v_settings FROM public.random_call_settings WHERE id = 1;
  SELECT * INTO v_row FROM public.random_call_skip_counters
    WHERE user_id = p_user_id AND day_bucket = v_today;

  IF v_row.cooldown_until IS NOT NULL AND v_row.cooldown_until > now() THEN
    v_cooldown_remaining := CEIL(EXTRACT(EPOCH FROM (v_row.cooldown_until - now())))::INT;
  END IF;

  v_daily_used := COALESCE(v_row.skip_count, 0);
  v_remaining := GREATEST(0, COALESCE(v_settings.daily_skip_limit, 30) - v_daily_used);

  RETURN jsonb_build_object(
    'on_cooldown', v_cooldown_remaining > 0,
    'cooldown_seconds_remaining', v_cooldown_remaining,
    'cooldown_until', v_row.cooldown_until,
    'cooldown_reason', v_row.cooldown_reason,
    'daily_used', v_daily_used,
    'daily_limit', COALESCE(v_settings.daily_skip_limit, 30),
    'daily_remaining', v_remaining,
    'daily_exhausted', v_remaining <= 0
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.check_random_skip_cooldown(UUID) TO authenticated, service_role;

-- Register a skip (rolling windows + cooldown decision)
CREATE OR REPLACE FUNCTION public.register_random_skip(p_user_id UUID)
RETURNS jsonb AS $$
DECLARE
  v_s RECORD;
  v_today DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_mult NUMERIC;
  v_row RECORD;
  v_cd_seconds INT := 0;
  v_reason TEXT := NULL;
  v_cooldown_until TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_s FROM public.random_call_settings WHERE id = 1;
  v_mult := public.get_random_skip_multiplier(p_user_id);

  INSERT INTO public.random_call_skip_counters AS r
    (user_id, day_bucket, skip_count, last_skip_at,
     soft_window_start, soft_window_count,
     extended_window_start, extended_window_count)
  VALUES
    (p_user_id, v_today, 1, now(), now(), 1, now(), 1)
  ON CONFLICT (user_id, day_bucket) DO UPDATE
    SET skip_count = r.skip_count + 1,
        last_skip_at = now(),
        soft_window_start = CASE
          WHEN r.soft_window_start IS NULL
            OR r.soft_window_start < now() - (v_s.skip_soft_window_seconds || ' seconds')::INTERVAL
          THEN now() ELSE r.soft_window_start END,
        soft_window_count = CASE
          WHEN r.soft_window_start IS NULL
            OR r.soft_window_start < now() - (v_s.skip_soft_window_seconds || ' seconds')::INTERVAL
          THEN 1 ELSE r.soft_window_count + 1 END,
        extended_window_start = CASE
          WHEN r.extended_window_start IS NULL
            OR r.extended_window_start < now() - (v_s.skip_extended_window_seconds || ' seconds')::INTERVAL
          THEN now() ELSE r.extended_window_start END,
        extended_window_count = CASE
          WHEN r.extended_window_start IS NULL
            OR r.extended_window_start < now() - (v_s.skip_extended_window_seconds || ' seconds')::INTERVAL
          THEN 1 ELSE r.extended_window_count + 1 END
  RETURNING * INTO v_row;

  -- Decide cooldown
  IF v_row.extended_window_count >= v_s.skip_extended_trigger_count THEN
    v_cd_seconds := CEIL(v_s.skip_extended_cooldown_seconds * v_mult)::INT;
    v_reason := 'extended_window_exceeded';
  ELSIF v_row.soft_window_count >= v_s.skip_soft_trigger_count THEN
    v_cd_seconds := CEIL(v_s.skip_soft_cooldown_seconds * v_mult)::INT;
    v_reason := 'soft_window_exceeded';
  ELSIF v_s.skip_cooldown_seconds > 0 THEN
    v_cd_seconds := CEIL(v_s.skip_cooldown_seconds * v_mult)::INT;
    v_reason := 'per_skip_cooldown';
  END IF;

  IF v_cd_seconds > 0 THEN
    v_cooldown_until := now() + (v_cd_seconds || ' seconds')::INTERVAL;
    UPDATE public.random_call_skip_counters
      SET cooldown_until = v_cooldown_until,
          cooldown_reason = v_reason
      WHERE user_id = p_user_id AND day_bucket = v_today;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'cooldown_until', v_cooldown_until,
    'cooldown_seconds', v_cd_seconds,
    'reason', v_reason,
    'daily_used', v_row.skip_count,
    'daily_limit', v_s.daily_skip_limit,
    'soft_window_count', v_row.soft_window_count,
    'extended_window_count', v_row.extended_window_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.register_random_skip(UUID) TO service_role;

-- Report a match (rolling-window host auto-suspend)
CREATE OR REPLACE FUNCTION public.report_random_match(
  p_session_id UUID,
  p_reporter_id UUID,
  p_reason TEXT,
  p_detail TEXT DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_s RECORD;
  v_session RECORD;
  v_target UUID;
  v_avail RECORD;
  v_threshold INT;
  v_suspend_hours INT;
  v_window_secs INT := 86400; -- 24h rolling reports window
  v_suspended BOOLEAN := false;
BEGIN
  SELECT * INTO v_session FROM public.random_call_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;
  IF p_reporter_id <> v_session.caller_id AND p_reporter_id <> v_session.host_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_party');
  END IF;
  v_target := CASE WHEN p_reporter_id = v_session.caller_id THEN v_session.host_id ELSE v_session.caller_id END;

  SELECT report_suspend_threshold, report_suspend_hours
    INTO v_threshold, v_suspend_hours
    FROM public.random_call_settings WHERE id = 1;

  -- Log report
  INSERT INTO public.user_reports (reporter_id, reported_user_id, reason, additional_info, status, created_at)
  VALUES (p_reporter_id, v_target, COALESCE(p_reason, 'random_call_report'),
          COALESCE(p_detail, 'random_call session ' || p_session_id::TEXT),
          'pending', now());

  -- Only auto-suspend hosts (caller reports of host)
  IF v_target = v_session.host_id THEN
    INSERT INTO public.host_match_availability (host_id, is_available, reports_window_start, reports_window_count)
    VALUES (v_target, true, now(), 1)
    ON CONFLICT (host_id) DO UPDATE
      SET reports_window_start = CASE
            WHEN host_match_availability.reports_window_start IS NULL
              OR host_match_availability.reports_window_start < now() - (v_window_secs || ' seconds')::INTERVAL
            THEN now() ELSE host_match_availability.reports_window_start END,
          reports_window_count = CASE
            WHEN host_match_availability.reports_window_start IS NULL
              OR host_match_availability.reports_window_start < now() - (v_window_secs || ' seconds')::INTERVAL
            THEN 1 ELSE host_match_availability.reports_window_count + 1 END
      RETURNING * INTO v_avail;

    IF v_avail.reports_window_count >= v_threshold THEN
      UPDATE public.host_match_availability
        SET match_suspend_until = now() + (v_suspend_hours || ' hours')::INTERVAL,
            suspend_reason = 'auto_reports_threshold',
            is_available = false
        WHERE host_id = v_target;
      v_suspended := true;
    END IF;
  END IF;

  -- Counter on reporter side
  INSERT INTO public.random_call_skip_counters
    (user_id, day_bucket, skip_count, last_skip_at, reports_count, last_report_at)
  VALUES (p_reporter_id, (now() AT TIME ZONE 'UTC')::DATE, 0, now(), 1, now())
  ON CONFLICT (user_id, day_bucket) DO UPDATE
    SET reports_count = public.random_call_skip_counters.reports_count + 1,
        last_report_at = now();

  RETURN jsonb_build_object('ok', true, 'target', v_target, 'host_suspended', v_suspended);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.report_random_match(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

-- Patch settle_random_call to auto-register skip when caller_skip under free_preview
CREATE OR REPLACE FUNCTION public.settle_random_call(
  p_session_id UUID,
  p_duration_seconds INT,
  p_ended_by TEXT
) RETURNS jsonb AS $$
DECLARE
  v_s RECORD;
  v_settings RECORD;
  v_billable INT;
  v_coins BIGINT;
  v_beans BIGINT;
  v_status TEXT;
  v_window_start TIMESTAMPTZ;
  v_skip_result jsonb := NULL;
BEGIN
  SELECT * INTO v_s FROM public.random_call_sessions
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;
  IF v_s.settled THEN
    RETURN jsonb_build_object('ok', true, 'already_settled', true);
  END IF;

  SELECT * INTO v_settings FROM public.random_call_settings WHERE id = 1;

  IF p_duration_seconds < v_s.min_billable_seconds THEN
    v_status := 'sub_minimum';
    v_coins := 0;
    v_beans := 0;
    v_billable := 0;

    IF p_ended_by = 'host' THEN
      SELECT flash_disconnect_window_start INTO v_window_start
        FROM public.host_match_preferences WHERE host_id = v_s.host_id;
      IF v_window_start IS NULL
         OR v_window_start < (now() - (v_settings.flash_disconnect_window_seconds || ' seconds')::INTERVAL) THEN
        UPDATE public.host_match_preferences
          SET flash_disconnects_count = 1,
              flash_disconnect_window_start = now(),
              updated_at = now()
          WHERE host_id = v_s.host_id;
      ELSE
        UPDATE public.host_match_preferences
          SET flash_disconnects_count = flash_disconnects_count + 1,
              updated_at = now(),
              flash_disconnect_cooldown_until = CASE
                WHEN flash_disconnects_count + 1 >= v_settings.flash_disconnect_threshold
                THEN now() + (v_settings.flash_disconnect_cooldown_minutes || ' minutes')::INTERVAL
                ELSE flash_disconnect_cooldown_until
              END
          WHERE host_id = v_s.host_id;
      END IF;
    END IF;
  ELSE
    v_billable := GREATEST(0, p_duration_seconds - v_s.free_trial_seconds);
    v_coins := CEIL((v_billable::NUMERIC / 60.0) * v_s.coin_rate_per_min)::BIGINT;
    v_beans := FLOOR(v_coins * v_s.host_split_pct)::BIGINT;
    v_status := 'completed';

    UPDATE public.profiles
      SET coins = GREATEST(0, COALESCE(coins, 0) - v_coins)
      WHERE id = v_s.caller_id;
    UPDATE public.profiles
      SET beans = COALESCE(beans, 0) + v_beans
      WHERE id = v_s.host_id;
  END IF;

  -- Anti-abuse: caller_skip within free_preview window -> register skip
  IF p_ended_by = 'caller_skip'
     AND p_duration_seconds < COALESCE(v_settings.free_preview_seconds, v_s.min_billable_seconds) THEN
    v_skip_result := public.register_random_skip(v_s.caller_id);
  END IF;

  UPDATE public.random_call_sessions
    SET status = v_status,
        duration_seconds = p_duration_seconds,
        billable_seconds = v_billable,
        coins_charged = v_coins,
        beans_awarded = v_beans,
        ended_by = p_ended_by,
        ended_at = COALESCE(ended_at, now()),
        settled = true,
        updated_at = now()
    WHERE id = p_session_id;

  UPDATE public.host_match_preferences
    SET total_calls = total_calls + 1,
        total_beans_earned = total_beans_earned + v_beans,
        updated_at = now()
    WHERE host_id = v_s.host_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_status,
    'duration_seconds', p_duration_seconds,
    'billable_seconds', v_billable,
    'coins_charged', v_coins,
    'beans_awarded', v_beans,
    'skip_registered', v_skip_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.settle_random_call(UUID, INT, TEXT) TO service_role;
