CREATE OR REPLACE FUNCTION public.end_live_stream(p_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_started timestamptz;
  v_is_active boolean;
  v_ended_existing timestamptz;
  v_ended timestamptz;
  v_duration int;
  v_audience int;
  v_total_coins bigint := 0;
  v_host_pct int;
  v_beans bigint := 0;
  v_total_diamonds bigint := 0;
  v_total_gifters int := 0;
  v_top jsonb := '[]'::jsonb;
  v_next jsonb;
  v_user_level int;
  v_max_level int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT started_at, is_active, ended_at
  INTO v_started, v_is_active, v_ended_existing
  FROM public.live_streams
  WHERE id = p_stream_id AND host_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stream not found or not your stream');
  END IF;

  v_ended := CASE WHEN v_is_active THEN now() ELSE coalesce(v_ended_existing, now()) END;

  IF v_is_active THEN
    UPDATE public.stream_viewers
    SET left_at = coalesce(left_at, v_ended)
    WHERE stream_id = p_stream_id AND left_at IS NULL;

    UPDATE public.live_streams
    SET is_active = false, ended_at = coalesce(ended_at, v_ended)
    WHERE id = p_stream_id AND host_id = uid;
  END IF;

  SELECT count(DISTINCT viewer_id)::int INTO v_audience
  FROM public.stream_viewers WHERE stream_id = p_stream_id;

  SELECT coalesce(sum(coin_amount), 0)::bigint INTO v_total_coins
  FROM public.gift_transactions
  WHERE stream_id = p_stream_id AND receiver_id = uid;

  SELECT coalesce(sum(diamond_cost), 0)::bigint INTO v_total_diamonds
  FROM public.gift_transactions
  WHERE stream_id = p_stream_id AND receiver_id = uid;

  SELECT count(DISTINCT sender_id)::int INTO v_total_gifters
  FROM public.gift_transactions
  WHERE stream_id = p_stream_id AND receiver_id = uid AND sender_id IS NOT NULL;

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'sender_id', s.sender_id,
          'total_coins', s.total_coins_spent,
          'display_name', s.display_name,
          'avatar_url', s.avatar_url
        )
        ORDER BY s.total_coins_spent DESC
      )
      FROM (
        SELECT
          gt.sender_id,
          sum(gt.coin_amount)::bigint AS total_coins_spent,
          max(pp.display_name) AS display_name,
          max(pp.avatar_url) AS avatar_url
        FROM public.gift_transactions gt
        LEFT JOIN public.profiles_public pp ON pp.id = gt.sender_id
        WHERE gt.stream_id = p_stream_id
          AND gt.receiver_id = uid
          AND gt.sender_id IS NOT NULL
        GROUP BY gt.sender_id
        ORDER BY sum(gt.coin_amount) DESC
        LIMIT 3
      ) s
    ),
    '[]'::jsonb
  ) INTO v_top;

  v_host_pct := public.get_effective_host_percent();
  v_beans := floor(v_total_coins * v_host_pct / 100.0)::bigint;

  v_duration := greatest(0, extract(epoch FROM (v_ended - coalesce(v_started, v_ended)))::int);

  SELECT p.user_level, p.max_user_level
  INTO v_user_level, v_max_level
  FROM public.profiles p WHERE p.id = uid;

  v_next := jsonb_build_object(
    'user_level', coalesce(v_user_level, 1),
    'max_user_level', coalesce(v_max_level, 99)
  );

  RETURN jsonb_build_object(
    'success', true,
    'stream_id', p_stream_id,
    'duration', v_duration,
    'total_beans', v_beans,
    'total_diamonds', v_total_diamonds,
    'total_gifters', v_total_gifters,
    'top_gifters', v_top,
    'next_level_progress', v_next,
    'duration_seconds', v_duration,
    'audience_count', coalesce(v_audience, 0),
    'total_gift_coins', v_total_coins,
    'estimated_host_beans', v_beans,
    'host_percent', v_host_pct
  );
END;
$$;

COMMENT ON FUNCTION public.end_live_stream(uuid) IS
  'Host ends stream; returns settlement (total_beans, total_diamonds, top_gifters, next_level_progress) + legacy keys.';