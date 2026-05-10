BEGIN;

CREATE OR REPLACE FUNCTION public.admin_agency_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'totalAgencies', (SELECT count(*) FROM public.agencies),
    'activeAgencies', (SELECT count(*) FROM public.agencies WHERE COALESCE(is_active, false) = true AND COALESCE(is_blocked, false) = false),
    'blockedAgencies', (SELECT count(*) FROM public.agencies WHERE COALESCE(is_blocked, false) = true),
    'inactiveAgencies', (SELECT count(*) FROM public.agencies WHERE COALESCE(is_active, false) = false OR COALESCE(is_blocked, false) = true),
    'totalHelpers', (SELECT count(*) FROM public.topup_helpers WHERE COALESCE(is_active, false) = true),
    'level5Helpers', (SELECT count(*) FROM public.topup_helpers WHERE COALESCE(trader_level, 0) >= 5 AND COALESCE(is_active, false) = true),
    'totalHosts', (SELECT count(*) FROM public.agency_hosts),
    'pendingWithdrawals', (SELECT count(*) FROM public.agency_withdrawals WHERE status IN ('pending','processing','screenshot_submitted')),
    'totalDiamonds', (SELECT COALESCE(sum(diamond_balance), 0) FROM public.agencies)
  ) INTO r;

  RETURN r;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_hosts_paginated(text, text, integer, integer);
CREATE FUNCTION public.admin_list_hosts_paginated(
  _status text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.profiles p
  WHERE COALESCE(p.is_host, false) = true
    AND (_status IS NULL OR _status = 'all' OR p.host_status = _status)
    AND (_search IS NULL OR _search = '' OR p.display_name ILIKE '%' || _search || '%' OR p.app_uid::text ILIKE '%' || _search || '%');

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.is_verified,
      p.is_blocked,
      p.host_level,
      p.host_status,
      p.call_rate_per_minute,
      COALESCE(p.total_earnings, 0)::bigint AS total_earnings,
      COALESCE(p.total_call_minutes, 0)::integer AS total_call_minutes,
      COALESCE(p.total_calls_received, 0)::integer AS total_calls_received,
      p.agency_id,
      p.created_at,
      CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('name', a.name, 'agency_code', a.agency_code) END AS agencies
    FROM public.profiles p
    LEFT JOIN public.agencies a ON a.id = p.agency_id
    WHERE COALESCE(p.is_host, false) = true
      AND (_status IS NULL OR _status = 'all' OR p.host_status = _status)
      AND (_search IS NULL OR _search = '' OR p.display_name ILIKE '%' || _search || '%' OR p.app_uid::text ILIKE '%' || _search || '%')
    ORDER BY COALESCE(p.total_earnings, 0) DESC, p.created_at DESC
    LIMIT GREATEST(COALESCE(_limit, 50), 1)
    OFFSET GREATEST(COALESCE(_offset, 0), 0)
  ) x;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_face_violations(uuid, integer);
CREATE FUNCTION public.admin_list_face_violations(_admin_id uuid DEFAULT NULL, _limit integer DEFAULT 200)
RETURNS TABLE(
  id uuid,
  host_id uuid,
  stream_id uuid,
  violation_type text,
  frame_url text,
  confidence numeric,
  action_taken text,
  status text,
  created_at timestamptz,
  display_name text,
  app_uid text,
  avatar_url text,
  detected_at timestamptz,
  auto_closed boolean,
  countdown_duration integer,
  notes text,
  admin_reviewed boolean,
  reviewed_by uuid,
  reviewed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.host_id,
    v.stream_id,
    v.violation_type::text,
    v.frame_url::text,
    v.confidence,
    v.action_taken::text,
    v.status::text,
    v.created_at,
    p.display_name::text,
    p.app_uid::text,
    p.avatar_url::text,
    v.created_at AS detected_at,
    (v.action_taken::text IN ('auto_end', 'auto_closed', 'live_ban')) AS auto_closed,
    CASE WHEN v.action_taken::text IN ('auto_end', 'auto_closed', 'live_ban') THEN 30 ELSE 10 END::integer AS countdown_duration,
    NULL::text AS notes,
    (v.reviewed_at IS NOT NULL OR COALESCE(v.status::text, '') NOT IN ('pending', 'new', 'unreviewed')) AS admin_reviewed,
    v.reviewed_by,
    v.reviewed_at
  FROM public.live_face_violations v
  LEFT JOIN public.profiles p ON p.id = v.host_id
  ORDER BY v.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 200), 1);
END;
$$;

ALTER TABLE public.helper_withdrawal_requests
  ADD COLUMN IF NOT EXISTS payment_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS beans_amount bigint,
  ADD COLUMN IF NOT EXISTS usd_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS local_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS payment_screenshot_url text,
  ADD COLUMN IF NOT EXISTS helper_notes text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS diamond_reward numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS helper_net_reward numeric NOT NULL DEFAULT 0;

UPDATE public.helper_withdrawal_requests
SET
  beans_amount = COALESCE(beans_amount, amount),
  diamond_reward = COALESCE(NULLIF(diamond_reward, 0), amount, 0),
  usd_amount = COALESCE(NULLIF(usd_amount, 0), NULLIF(payment_details->>'usd_amount', '')::numeric, 0),
  local_amount = COALESCE(NULLIF(local_amount, 0), NULLIF(payment_details->>'local_amount', '')::numeric, 0),
  currency_code = COALESCE(NULLIF(currency_code, ''), payment_details->>'currency_code', 'USD'),
  payment_screenshot_url = COALESCE(payment_screenshot_url, payment_details->>'payment_screenshot_url', payment_details->>'helper_payment_screenshot'),
  helper_notes = COALESCE(helper_notes, payment_details->>'helper_notes'),
  approved_at = COALESCE(approved_at, CASE WHEN status = 'approved' THEN processed_at ELSE NULL END)
WHERE beans_amount IS NULL
   OR diamond_reward IS NULL OR diamond_reward = 0
   OR currency_code IS NULL OR currency_code = ''
   OR payment_screenshot_url IS NULL
   OR helper_notes IS NULL
   OR approved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_helper_withdrawal_requests_approved_at
  ON public.helper_withdrawal_requests(approved_at DESC)
  WHERE approved_at IS NOT NULL;

DROP FUNCTION IF EXISTS public.check_ban_on_login(uuid);
CREATE FUNCTION public.check_ban_on_login(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.check_ban_on_login(p_user_id, NULL::text, NULL::text);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_agency_overview_stats() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_hosts_paginated(text, text, integer, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_face_violations(uuid, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_ban_on_login(uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;