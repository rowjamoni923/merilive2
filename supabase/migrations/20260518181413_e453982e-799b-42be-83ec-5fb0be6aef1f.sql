
CREATE OR REPLACE FUNCTION public.get_my_host_bonus_ledger(_limit_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host uuid := auth.uid();
  _max_hours int;
  _days jsonb;
  _totals jsonb;
BEGIN
  IF _host IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT COUNT(*) INTO _max_hours
  FROM new_host_live_bonus_settings
  WHERE is_active = true AND hour_number IS NOT NULL;

  -- Per program-day, with per-hour breakdown and cap check.
  WITH per_day AS (
    SELECT
      p.program_day,
      MAX(p.task_date) AS task_date,
      jsonb_agg(jsonb_build_object(
        'hour_number', p.hour_number,
        'target_minutes', COALESCE(p.target_minutes, 60),
        'minutes_accumulated', COALESCE(p.minutes_accumulated, 0),
        'completed', COALESCE(p.minutes_accumulated, 0) >= COALESCE(p.target_minutes, 60),
        'claimed', COALESCE(p.bonus_claimed, false),
        'claimed_beans', COALESCE(p.claimed_beans, 0),
        'bonus_amount', COALESCE(p.bonus_amount, 0),
        'claimed_at', p.claimed_at,
        'last_minute_at', p.last_minute_at
      ) ORDER BY p.hour_number) AS hours,
      COUNT(*) FILTER (
        WHERE COALESCE(p.minutes_accumulated, 0) >= COALESCE(p.target_minutes, 60)
      ) AS completed_hours,
      COALESCE(SUM(p.claimed_beans) FILTER (WHERE p.bonus_claimed), 0) AS day_beans,
      COUNT(*) AS row_count
    FROM new_host_live_bonus_progress p
    WHERE p.host_id = _host
    GROUP BY p.program_day
    ORDER BY p.program_day DESC
    LIMIT GREATEST(_limit_days, 1)
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'program_day', program_day,
      'task_date', task_date,
      'hours', hours,
      'completed_hours', completed_hours,
      'rows_recorded', row_count,
      'day_beans', day_beans,
      'cap_exceeded', row_count > COALESCE(_max_hours, 5)
    )), '[]'::jsonb)
  INTO _days
  FROM per_day;

  SELECT jsonb_build_object(
    'total_beans', COALESCE(SUM(claimed_beans) FILTER (WHERE bonus_claimed), 0),
    'total_claimed_hours', COUNT(*) FILTER (WHERE bonus_claimed),
    'total_completed_hours', COUNT(*) FILTER (
      WHERE COALESCE(minutes_accumulated, 0) >= COALESCE(target_minutes, 60)
    )
  )
  INTO _totals
  FROM new_host_live_bonus_progress
  WHERE host_id = _host;

  RETURN jsonb_build_object(
    'success', true,
    'max_hours_per_day', COALESCE(_max_hours, 0),
    'days', _days,
    'totals', _totals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_host_bonus_ledger(int) TO authenticated;
