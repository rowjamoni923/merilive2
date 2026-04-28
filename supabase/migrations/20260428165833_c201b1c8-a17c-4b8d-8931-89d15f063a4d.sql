
-- =========================================================
-- Pkg10: Content & Asset Management hardening
-- - Visual Hub stats RPCs (single round-trip count)
-- - Asset full-list RPCs (bypass adminClient 500-row REST cap)
-- - Moderation/Reports overview + paginated logs RPC
-- All RPCs gated by is_active_admin_session()
-- =========================================================

-- 1) Visual Assets Hub stats (frames + role frames + bubbles + gifts + shop + entry banners)
CREATE OR REPLACE FUNCTION public.admin_visual_assets_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'frames',       (SELECT COUNT(*) FROM public.avatar_frames WHERE is_active = true),
    'frames_total', (SELECT COUNT(*) FROM public.avatar_frames),
    'role_frames',  (SELECT COUNT(*) FROM public.role_frames WHERE is_active = true),
    'role_frames_total', (SELECT COUNT(*) FROM public.role_frames),
    'chat_bubbles', (SELECT COUNT(*) FROM public.level_privileges WHERE privilege_type = 'chat_bubble' AND COALESCE(is_active, true) = true),
    'gifts',        (SELECT COUNT(*) FROM public.gifts WHERE is_active = true),
    'gifts_total',  (SELECT COUNT(*) FROM public.gifts),
    'shop_items',   (SELECT COUNT(*) FROM public.shop_items WHERE is_active = true),
    'shop_items_total', (SELECT COUNT(*) FROM public.shop_items),
    'entry_banners',(SELECT COUNT(*) FROM public.entry_banners WHERE is_active = true),
    'entry_banners_total', (SELECT COUNT(*) FROM public.entry_banners)
  );
END;
$$;

-- 2) Entry Effects Hub stats (banners + bars + name bars + vehicles)
CREATE OR REPLACE FUNCTION public.admin_entry_effects_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vehicles int := 0;
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  BEGIN
    EXECUTE 'SELECT COUNT(*) FROM public.vehicle_entrances WHERE is_active = true' INTO v_vehicles;
  EXCEPTION WHEN undefined_table THEN
    v_vehicles := 0;
  END;

  RETURN jsonb_build_object(
    'banners',  (SELECT COUNT(*) FROM public.entry_banners),
    'bars',     (SELECT COUNT(*) FROM public.level_privileges WHERE privilege_type = 'entry_bar'),
    'name_bars',(SELECT COUNT(*) FROM public.level_privileges WHERE privilege_type = 'entry_name_bar'),
    'vehicles', v_vehicles
  );
END;
$$;

-- 3) Asset full-list RPCs (bypass 500-row adminClient cap; full list for drag-reorder)
CREATE OR REPLACE FUNCTION public.admin_list_avatar_frames_all()
RETURNS SETOF public.avatar_frames
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.avatar_frames
    ORDER BY display_order NULLS LAST, created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_role_frames_all()
RETURNS SETOF public.role_frames
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.role_frames
    ORDER BY display_order NULLS LAST, created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_gifts_all()
RETURNS SETOF public.gifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.gifts
    ORDER BY display_order NULLS LAST, created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_shop_items_all()
RETURNS SETOF public.shop_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.shop_items
    ORDER BY display_order NULLS LAST, created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_entry_banners_all()
RETURNS SETOF public.entry_banners
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.entry_banners
    ORDER BY display_order NULLS LAST, created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_chat_bubbles_all()
RETURNS SETOF public.level_privileges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.level_privileges
    WHERE privilege_type = 'chat_bubble'
    ORDER BY level_required NULLS LAST, created_at DESC;
END;
$$;

-- 4) Moderation overview stats (single round-trip)
CREATE OR REPLACE FUNCTION public.admin_moderation_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'total_logs',     (SELECT COUNT(*) FROM public.chat_moderation_logs),
    'logs_today',     (SELECT COUNT(*) FROM public.chat_moderation_logs WHERE created_at::date = v_today),
    'phone_violations',(SELECT COUNT(*) FROM public.chat_moderation_logs WHERE violation_type = 'phone_number'),
    'auto_bans',      (SELECT COUNT(*) FROM public.chat_moderation_logs WHERE action_taken = 'auto_ban'),
    'warnings',       (SELECT COUNT(*) FROM public.chat_moderation_logs WHERE action_taken = 'warning'),
    'blocked_users',  (SELECT COUNT(*) FROM public.profiles WHERE COALESCE(is_blocked, false) = true)
  );
END;
$$;

-- 5) Paginated chat moderation logs with embedded user profile (no client-side N+1 join)
CREATE OR REPLACE FUNCTION public.admin_list_chat_moderation_logs_paginated(
  _page int DEFAULT 1,
  _page_size int DEFAULT 20,
  _filter_type text DEFAULT 'all'  -- 'all' | 'phone_number' | 'auto_ban' | 'warning'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset int;
  v_total int;
  v_rows jsonb;
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  _page := GREATEST(1, COALESCE(_page, 1));
  _page_size := LEAST(100, GREATEST(1, COALESCE(_page_size, 20)));
  v_offset := (_page - 1) * _page_size;

  WITH base AS (
    SELECT *
    FROM public.chat_moderation_logs l
    WHERE
      _filter_type = 'all'
      OR (_filter_type = 'phone_number' AND l.violation_type = 'phone_number')
      OR (_filter_type = 'auto_ban'     AND l.action_taken   = 'auto_ban')
      OR (_filter_type = 'warning'      AND l.action_taken   = 'warning')
  ),
  cnt AS (SELECT COUNT(*)::int AS c FROM base)
  SELECT (SELECT c FROM cnt),
         COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
    INTO v_total, v_rows
  FROM (
    SELECT
      b.*,
      jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'app_uid', p.app_uid,
        'is_blocked', p.is_blocked
      ) AS user_profile
    FROM base b
    LEFT JOIN public.profiles p ON p.id = b.user_id
    ORDER BY b.created_at DESC
    OFFSET v_offset
    LIMIT _page_size
  ) x;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'page', _page,
    'page_size', _page_size
  );
END;
$$;

-- 6) Reports overview stats (single round-trip; replaces 4 count() + 4 large fetches)
-- Returns daily series for last 90 days (chart can slice by week/month/90d on client).
CREATE OR REPLACE FUNCTION public.admin_reports_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_total_users int;
  v_new_today int;
  v_total_gifts int;
  v_total_streams int;
  v_total_calls int;
  v_total_coins bigint;
  v_series jsonb;
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT COUNT(*) INTO v_total_users FROM public.profiles;
  SELECT COUNT(*) INTO v_new_today FROM public.profiles WHERE created_at::date = v_today;
  SELECT COUNT(*) INTO v_total_gifts FROM public.gift_transactions;
  SELECT COUNT(*) INTO v_total_streams FROM public.live_streams;
  SELECT COUNT(*) INTO v_total_calls FROM public.private_calls;
  SELECT COALESCE(SUM(coin_amount), 0) INTO v_total_coins
    FROM public.gift_transactions
    WHERE created_at >= (now() - interval '90 days');

  WITH days AS (
    SELECT generate_series(v_today - 89, v_today, interval '1 day')::date AS d
  ),
  u AS (
    SELECT created_at::date AS d, COUNT(*)::int AS c
    FROM public.profiles
    WHERE created_at >= v_today - 89
    GROUP BY 1
  ),
  g AS (
    SELECT created_at::date AS d, COALESCE(SUM(coin_amount), 0)::bigint AS c
    FROM public.gift_transactions
    WHERE created_at >= v_today - 89
    GROUP BY 1
  ),
  s AS (
    SELECT created_at::date AS d, COUNT(*)::int AS c
    FROM public.live_streams
    WHERE created_at >= v_today - 89
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', d.d,
    'users', COALESCE(u.c, 0),
    'coins', COALESCE(g.c, 0),
    'streams', COALESCE(s.c, 0)
  ) ORDER BY d.d), '[]'::jsonb)
  INTO v_series
  FROM days d
  LEFT JOIN u ON u.d = d.d
  LEFT JOIN g ON g.d = d.d
  LEFT JOIN s ON s.d = d.d;

  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'new_users_today', v_new_today,
    'total_gifts_sent', v_total_gifts,
    'total_streams', v_total_streams,
    'total_calls', v_total_calls,
    'total_coins_spent_90d', v_total_coins,
    'series', v_series
  );
END;
$$;

-- Permissions: callable by authenticated (RLS gating is via is_active_admin_session inside)
GRANT EXECUTE ON FUNCTION public.admin_visual_assets_stats() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_entry_effects_stats() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_avatar_frames_all() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_role_frames_all() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_gifts_all() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_shop_items_all() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_entry_banners_all() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_chat_bubbles_all() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderation_overview_stats() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_chat_moderation_logs_paginated(int, int, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_reports_overview_stats() TO authenticated, anon;
