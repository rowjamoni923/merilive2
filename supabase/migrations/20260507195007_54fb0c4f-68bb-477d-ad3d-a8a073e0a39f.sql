CREATE OR REPLACE FUNCTION public.admin_agency_overview_stats(p_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _wallet numeric;
  _diamond bigint;
  _active int;
  _pending int;
  _today_bean numeric;
  _today_diamond bigint;
  _beans_per_usd numeric;
  _today_usd numeric;
  _rate_text text;
  _rate_val numeric;
BEGIN
  IF p_agency_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'agency_id required');
  END IF;

  SELECT a.owner_id, a.wallet_balance::numeric, COALESCE(a.diamond_balance, 0)::bigint
  INTO _owner, _wallet, _diamond
  FROM public.agencies a
  WHERE a.id = p_agency_id AND COALESCE(a.is_blocked, false) = false;

  IF _owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  IF _owner IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT count(*)::int INTO _active
  FROM public.agency_hosts
  WHERE agency_id = p_agency_id AND status = 'active';

  SELECT count(*)::int INTO _pending
  FROM public.agency_hosts
  WHERE agency_id = p_agency_id AND status = 'pending';

  SELECT COALESCE(ap.total_income, 0) INTO _today_bean
  FROM public.agency_performance ap
  WHERE ap.agency_id = p_agency_id
    AND ap.period_type = 'daily'
    AND ap.period_start = (timezone('utc', now()))::date
  LIMIT 1;

  IF _today_bean IS NULL THEN
    _today_bean := 0;
  END IF;

  SELECT COALESCE(SUM(GREATEST(diamond_amount, 0)), 0)::bigint
  INTO _today_diamond
  FROM public.agency_diamond_transactions
  WHERE agency_id = p_agency_id
    AND created_at >= date_trunc('day', timezone('utc', now()));

  _beans_per_usd := NULL;
  SELECT setting_value INTO _rate_text
  FROM public.app_settings
  WHERE setting_key = 'beans_to_usd_rate'
  LIMIT 1;

  IF _rate_text IS NOT NULL AND length(trim(_rate_text)) > 0 THEN
    BEGIN
      _rate_val := (trim(_rate_text)::jsonb->>'rate')::numeric;
      IF _rate_val > 0 THEN
        _beans_per_usd := _rate_val;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _beans_per_usd := NULL;
    END;
  END IF;

  IF _beans_per_usd IS NOT NULL AND _beans_per_usd > 0 THEN
    _today_usd := (_today_bean / _beans_per_usd);
  ELSE
    _today_usd := NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'wallet_balance', COALESCE(_wallet, 0),
    'diamond_balance', COALESCE(_diamond, 0),
    'active_hosts', COALESCE(_active, 0),
    'pending_requests', COALESCE(_pending, 0),
    'today_beans', _today_bean,
    'today_diamonds', COALESCE(_today_diamond, 0),
    'today_usd', _today_usd
  );
END;
$$;

COMMENT ON FUNCTION public.admin_agency_overview_stats(uuid) IS
  'Section 14: agency owner hero + today stats (wallet, diamonds, host counts, daily performance).';

GRANT EXECUTE ON FUNCTION public.admin_agency_overview_stats(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.agency_dashboard_charts(p_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _levels jsonb;
  _this_week numeric;
  _last_week numeric;
BEGIN
  IF p_agency_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'agency_id required');
  END IF;

  SELECT a.owner_id INTO _owner
  FROM public.agencies a
  WHERE a.id = p_agency_id AND COALESCE(a.is_blocked, false) = false;

  IF _owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  IF _owner IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'level', lvl,
    'count', cnt
  ) ORDER BY lvl), '[]'::jsonb)
  INTO _levels
  FROM (
    SELECT COALESCE(NULLIF(p.user_level::text, ''), '0') AS lvl, count(*)::int AS cnt
    FROM public.agency_hosts ah
    INNER JOIN public.profiles p ON p.id = ah.host_id
    WHERE ah.agency_id = p_agency_id AND ah.status = 'active'
    GROUP BY 1
  ) s;

  _this_week := NULL;
  _last_week := NULL;
  SELECT ap.total_income INTO _this_week
  FROM public.agency_performance ap
  WHERE ap.agency_id = p_agency_id AND ap.period_type = 'weekly'
  ORDER BY ap.period_start DESC
  LIMIT 1;

  SELECT ap.total_income INTO _last_week
  FROM public.agency_performance ap
  WHERE ap.agency_id = p_agency_id AND ap.period_type = 'weekly'
  ORDER BY ap.period_start DESC
  LIMIT 1 OFFSET 1;

  RETURN jsonb_build_object(
    'success', true,
    'host_levels', COALESCE(_levels, '[]'::jsonb),
    'weekly_compare', jsonb_build_object(
      'this_week', COALESCE(_this_week, 0),
      'last_week', COALESCE(_last_week, 0)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.agency_dashboard_charts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.agency_dashboard_list_hosts(
  p_agency_id uuid,
  p_search text DEFAULT '',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _total int;
  _rows jsonb;
  _lim int := least(greatest(COALESCE(p_limit, 50), 1), 100);
  _off int := greatest(COALESCE(p_offset, 0), 0);
  _needle text := lower(trim(COALESCE(p_search, '')));
BEGIN
  IF p_agency_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'agency_id required');
  END IF;

  SELECT a.owner_id INTO _owner
  FROM public.agencies a
  WHERE a.id = p_agency_id AND COALESCE(a.is_blocked, false) = false;

  IF _owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  IF _owner IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT count(*)::int INTO _total
  FROM public.agency_hosts ah
  INNER JOIN public.profiles p ON p.id = ah.host_id
  WHERE ah.agency_id = p_agency_id
    AND ah.status = 'active'
    AND (
      _needle = ''
      OR lower(COALESCE(p.display_name, '')) LIKE '%' || _needle || '%'
      OR lower(COALESCE(p.app_uid, '')) LIKE '%' || _needle || '%'
    );

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'membership_id', r.membership_id,
      'host_id', r.host_id,
      'display_name', r.display_name,
      'avatar_url', r.avatar_url,
      'app_uid', r.app_uid,
      'user_level', r.user_level,
      'is_online', r.is_online,
      'week_beans', r.week_beans,
      'status', r.status
    )
  ), '[]'::jsonb)
  INTO _rows
  FROM (
    SELECT
      ah.id AS membership_id,
      ah.host_id,
      p.display_name,
      p.avatar_url,
      p.app_uid,
      COALESCE(p.user_level, 1) AS user_level,
      COALESCE(p.is_online, false) AS is_online,
      ah.status,
      COALESCE((
        SELECT SUM(
          COALESCE(t.gift_earnings, 0)::numeric + COALESCE(t.call_earnings, 0)::numeric
        )
        FROM public.agency_earnings_transfers t
        WHERE t.agency_id = p_agency_id
          AND t.host_id = ah.host_id
          AND t.created_at >= date_trunc('week', timezone('utc', now()))
      ), 0)::numeric AS week_beans
    FROM public.agency_hosts ah
    INNER JOIN public.profiles p ON p.id = ah.host_id
    WHERE ah.agency_id = p_agency_id
      AND ah.status = 'active'
      AND (
        _needle = ''
        OR lower(COALESCE(p.display_name, '')) LIKE '%' || _needle || '%'
        OR lower(COALESCE(p.app_uid, '')) LIKE '%' || _needle || '%'
      )
    ORDER BY p.display_name NULLS LAST
    LIMIT _lim OFFSET _off
  ) r;

  RETURN jsonb_build_object(
    'success', true,
    'total', _total,
    'rows', COALESCE(_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.agency_dashboard_list_hosts(uuid, text, int, int) TO authenticated;