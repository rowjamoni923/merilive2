CREATE OR REPLACE FUNCTION public.start_live_stream(
  p_title text DEFAULT NULL,
  p_thumbnail_url text DEFAULT NULL,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  gate jsonb;
  v_title text;
  new_row public.live_streams%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'auth',
      'reason', 'Not authenticated.'
    );
  END IF;

  UPDATE public.stream_viewers sv
  SET left_at = coalesce(left_at, now())
  FROM public.live_streams ls
  WHERE ls.id = sv.stream_id
    AND ls.host_id = uid
    AND coalesce(ls.is_active, false) = true
    AND sv.left_at IS NULL;

  UPDATE public.live_streams
  SET is_active = false,
      ended_at = now(),
      viewer_count = 0
  WHERE host_id = uid
    AND coalesce(is_active, false) = true;

  SELECT public.can_user_go_live() INTO gate;
  IF coalesce((gate->>'allowed')::boolean, false) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', coalesce(gate->>'code', 'denied'),
      'reason', coalesce(gate->>'reason', 'Not allowed to go live.')
    );
  END IF;

  v_title := trim(coalesce(p_title, ''));
  IF v_title = '' THEN
    IF trim(coalesce(p_display_name, '')) <> '' THEN
      v_title := trim(p_display_name) || '''s Live';
    ELSE
      v_title := 'User''s Live';
    END IF;
  END IF;

  INSERT INTO public.live_streams (
    host_id,
    title,
    thumbnail_url,
    is_active,
    started_at,
    viewer_count,
    total_coins_earned
  )
  VALUES (
    uid,
    v_title,
    nullif(trim(coalesce(p_thumbnail_url, '')), ''),
    true,
    now(),
    0,
    0
  )
  RETURNING * INTO new_row;

  RETURN jsonb_build_object(
    'success', true,
    'stream', jsonb_build_object(
      'id', new_row.id,
      'host_id', new_row.host_id,
      'title', new_row.title,
      'viewer_count', new_row.viewer_count,
      'is_active', new_row.is_active,
      'thumbnail_url', new_row.thumbnail_url,
      'started_at', new_row.started_at
    )
  );
END;
$$;

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
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stream not found or not your stream'
    );
  END IF;

  v_ended := CASE
    WHEN v_is_active THEN now()
    ELSE coalesce(v_ended_existing, now())
  END;

  IF v_is_active THEN
    UPDATE public.stream_viewers
    SET left_at = coalesce(left_at, v_ended)
    WHERE stream_id = p_stream_id AND left_at IS NULL;

    UPDATE public.live_streams
    SET is_active = false,
        ended_at = coalesce(ended_at, v_ended)
    WHERE id = p_stream_id AND host_id = uid;
  END IF;

  SELECT count(DISTINCT viewer_id)::int INTO v_audience
  FROM public.stream_viewers
  WHERE stream_id = p_stream_id;

  SELECT coalesce(sum(coin_amount), 0)::bigint INTO v_total_coins
  FROM public.gift_transactions
  WHERE stream_id = p_stream_id AND receiver_id = uid;

  v_host_pct := public.get_effective_host_percent();
  v_beans := floor(v_total_coins * v_host_pct / 100.0)::bigint;

  v_duration := greatest(
    0,
    extract(epoch FROM (v_ended - coalesce(v_started, v_ended)))::int
  );

  RETURN jsonb_build_object(
    'success', true,
    'stream_id', p_stream_id,
    'duration_seconds', v_duration,
    'audience_count', coalesce(v_audience, 0),
    'total_gift_coins', v_total_coins,
    'estimated_host_beans', v_beans,
    'host_percent', v_host_pct
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_live_stream(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_live_stream(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_live_stream(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.end_live_stream(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_live_stream(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.end_live_stream(uuid) TO authenticated;

COMMENT ON FUNCTION public.start_live_stream(text, text, text) IS
  'Creates a live_streams row after host-local cleanup and can_user_go_live(); returns stream payload for clients.';

COMMENT ON FUNCTION public.end_live_stream(uuid) IS
  'Host ends stream: marks inactive, closes stream_viewers, returns audience + gift settlement (beans estimate from server percent).';